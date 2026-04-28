import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { IFileAccessor, FileInfo, FileStats } from './IFileAccessor';

/**
 * WSL file accessor using direct file system access via Windows UNC paths
 */
export class WSLFileAccessor implements IFileAccessor {
  private distroName: string;
  private remotePath: string;
  private excludePatterns: string[];

  constructor(
    distroName: string,
    remotePath: string,
    excludePatterns: string[]
  ) {
    this.distroName = distroName;
    this.remotePath = remotePath;
    this.excludePatterns = excludePatterns;
  }

  /**
   * Convert Linux path to Windows UNC path
   */
  private toWindowsPath(linuxPath: string): string {
    // Normalize path separators to forward slashes first
    const normalizedPath = linuxPath.replace(/\\/g, '/');
    // Convert forward slashes to backslashes for Windows UNC path
    const windowsPath = normalizedPath.replace(/\//g, '\\');
    return `\\\\wsl$\\${this.distroName}${windowsPath}`;
  }

  /**
   * Validate path for Windows compatibility
   */
  private validatePath(linuxPath: string): void {
    // Check Windows reserved characters
    if (/[<>:"|?*]/.test(linuxPath)) {
      throw new Error(
        `Path contains Windows-incompatible characters: ${linuxPath}\n` +
        `Please rename the file in WSL to remove: < > : " | ? *`
      );
    }

    // Check Windows reserved names
    const fileName = path.basename(linuxPath);
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(fileName)) {
      throw new Error(
        `File name is reserved by Windows: ${fileName}\n` +
        `Please rename the file in WSL.`
      );
    }

    // Check path length (conservative limit: 250 chars)
    const windowsPath = this.toWindowsPath(linuxPath);
    if (windowsPath.length > 250) {
      throw new Error(
        `Path too long for Windows (${windowsPath.length} chars): ${linuxPath}\n` +
        `Windows has a 260-character limit.`
      );
    }
  }

  /**
   * Detect case-sensitivity conflicts
   */
  private detectCaseConflicts(files: Map<string, FileInfo>): void {
    const caseMap = new Map<string, string>();

    for (const [filePath] of files.entries()) {
      const lowerPath = filePath.toLowerCase();

      if (caseMap.has(lowerPath)) {
        throw new Error(
          `Case-sensitive filename conflict detected:\n` +
          `  - ${caseMap.get(lowerPath)}\n` +
          `  - ${filePath}\n` +
          `These files are different in WSL but would be the same on Windows.`
        );
      }

      caseMap.set(lowerPath, filePath);
    }
  }

  /**
   * Check if WSL distribution is running
   */
  private isDistributionStopped(error: any): boolean {
    return error.code === 'ENOENT' || error.code === 'ENOTDIR';
  }

  /**
   * Check if file should be excluded
   */
  private isExcluded(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');

    for (const pattern of this.excludePatterns) {
      if (minimatch(normalizedPath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Scan directory and return all files with metadata
   */
  public async scanDirectory(basePath: string): Promise<Map<string, FileInfo>> {
    const files = new Map<string, FileInfo>();

    try {
      await this.scanRecursive(basePath, '', files);
    } catch (error: any) {
      if (this.isDistributionStopped(error)) {
        throw new Error(
          `WSL distribution '${this.distroName}' is not running.\n` +
          `Start it with: wsl -d ${this.distroName}`
        );
      }
      throw error;
    }

    // Detect case-sensitivity conflicts before returning
    this.detectCaseConflicts(files);

    return files;
  }

  /**
   * Recursively scan directory
   */
  private async scanRecursive(
    basePath: string,
    relativePath: string,
    files: Map<string, FileInfo>
  ): Promise<void> {
    const fullLinuxPath = path.posix.join(basePath, relativePath);
    const windowsPath = this.toWindowsPath(fullLinuxPath);

    const entries = await fs.promises.readdir(windowsPath, { withFileTypes: true });

    for (const entry of entries) {
      const itemRelativePath = path.posix.join(relativePath, entry.name);

      // Check if excluded
      if (this.isExcluded(itemRelativePath)) {
        continue;
      }

      // Validate path for Windows compatibility
      const itemFullLinuxPath = path.posix.join(basePath, itemRelativePath);
      this.validatePath(itemFullLinuxPath);

      if (entry.isDirectory()) {
        // Recursively scan subdirectory
        try {
          await this.scanRecursive(basePath, itemRelativePath, files);
        } catch (error) {
          console.error(`Failed to scan directory ${itemRelativePath}:`, error);
        }
      } else if (entry.isFile()) {
        // Get file stats
        const itemWindowsPath = this.toWindowsPath(itemFullLinuxPath);
        const stats = await fs.promises.stat(itemWindowsPath);

        files.set(itemRelativePath, {
          mtime: stats.mtimeMs,
          size: stats.size
        });
      }
      // Symlinks are skipped (neither isDirectory nor isFile)
    }
  }

  /**
   * Download file from WSL to local Windows directory
   */
  public async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const remoteFullPath = path.posix.join(this.remotePath, remotePath);
    const windowsPath = this.toWindowsPath(remoteFullPath);
    const localTempPath = `${localPath}.tmp`;

    try {
      // Ensure local directory exists
      const localDir = path.dirname(localPath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      // Get remote file size before copying
      const remoteStats = await fs.promises.stat(windowsPath);

      // Copy to temp file
      await fs.promises.copyFile(windowsPath, localTempPath);

      // Verify file size
      const localStats = await fs.promises.stat(localTempPath);
      if (localStats.size !== remoteStats.size) {
        fs.unlinkSync(localTempPath);
        throw new Error(`File size mismatch: ${remotePath}`);
      }

      // Rename to final name
      fs.renameSync(localTempPath, localPath);
    } catch (error: any) {
      // Clean up temp file on error
      if (fs.existsSync(localTempPath)) {
        fs.unlinkSync(localTempPath);
      }

      if (this.isDistributionStopped(error)) {
        throw new Error(
          `WSL distribution '${this.distroName}' is not running.\n` +
          `Start it with: wsl -d ${this.distroName}`
        );
      }

      throw error;
    }
  }

  /**
   * Get file statistics
   */
  public async getFileStats(filePath: string): Promise<FileStats> {
    const fullPath = path.posix.join(this.remotePath, filePath);
    const windowsPath = this.toWindowsPath(fullPath);

    try {
      const stats = await fs.promises.stat(windowsPath);

      return {
        mtime: stats.mtimeMs,
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory()
      };
    } catch (error: any) {
      if (this.isDistributionStopped(error)) {
        throw new Error(
          `WSL distribution '${this.distroName}' is not running.\n` +
          `Start it with: wsl -d ${this.distroName}`
        );
      }
      throw error;
    }
  }

  /**
   * Clean up orphaned temporary files
   */
  public cleanupTempFiles(localPath: string): void {
    try {
      const files = this.findTempFilesRecursive(localPath);
      for (const file of files) {
        try {
          fs.unlinkSync(file);
          console.log(`Cleaned up temp file: ${file}`);
        } catch (err) {
          // Ignore errors, file might be in use
        }
      }
    } catch (err) {
      // Ignore errors during cleanup
    }
  }

  /**
   * Find all .tmp files recursively
   */
  private findTempFilesRecursive(dir: string): string[] {
    const tempFiles: string[] = [];

    if (!fs.existsSync(dir)) {
      return tempFiles;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        tempFiles.push(...this.findTempFilesRecursive(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.tmp')) {
        tempFiles.push(fullPath);
      }
    }

    return tempFiles;
  }
}
