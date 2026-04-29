import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
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
   * Returns error message if invalid, null if valid
   */
  private validatePath(linuxPath: string): string | null {
    // Check Windows reserved characters
    if (/[<>:"|?*]/.test(linuxPath)) {
      return `Path contains Windows-incompatible characters: ${linuxPath}. Please rename the file in WSL to remove: < > : " | ? *`;
    }

    // Check Windows reserved names
    const fileName = path.basename(linuxPath);
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(fileName)) {
      return `File name is reserved by Windows: ${fileName}. Please rename the file in WSL.`;
    }

    // Check path length (conservative limit: 250 chars)
    const windowsPath = this.toWindowsPath(linuxPath);
    if (windowsPath.length > 250) {
      return `Path too long for Windows (${windowsPath.length} chars): ${linuxPath}. Windows has a 260-character limit.`;
    }

    return null;
  }

  /**
   * Detect case-sensitivity conflicts and remove conflicting files
   * Returns array of conflicts for reporting
   */
  private detectCaseConflicts(files: Map<string, FileInfo>): Array<{ files: string[]; reason: string }> {
    const caseMap = new Map<string, string[]>();
    const conflicts: Array<{ files: string[]; reason: string }> = [];

    // Group files by lowercase path
    for (const [filePath] of files.entries()) {
      const lowerPath = filePath.toLowerCase();
      if (!caseMap.has(lowerPath)) {
        caseMap.set(lowerPath, []);
      }
      caseMap.get(lowerPath)!.push(filePath);
    }

    // Find conflicts and remove all conflicting files
    for (const [lowerPath, filePaths] of caseMap.entries()) {
      if (filePaths.length > 1) {
        // Multiple files with same lowercase path = conflict
        conflicts.push({
          files: filePaths,
          reason: 'Case-insensitive conflict on Windows'
        });

        // Remove all conflicting files from scan result
        for (const filePath of filePaths) {
          files.delete(filePath);
        }

        // Log error for each conflict
        console.error(
          `[WSL Sync] Case conflict detected: ${filePaths.join(' vs ')}\n` +
          `Windows cannot distinguish these files. All conflicting files excluded from sync.`
        );
      }
    }

    return conflicts;
  }

  /**
   * Check if WSL distribution is running
   */
  private isDistributionStopped(error: any): boolean {
    // Handle both Node.js fs errors and VSCode FileSystemError
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return true;
    }
    // VSCode FileSystemError codes
    if (error.code === 'FileNotFound' || error.code === 'FileNotADirectory') {
      return true;
    }
    return false;
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
    const result = await this.scanDirectoryWithConflicts(basePath);
    return result.files;
  }

  /**
   * Scan directory with conflict detection
   */
  public async scanDirectoryWithConflicts(basePath: string): Promise<import('./IFileAccessor').ScanResult> {
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

    // Detect case-sensitivity conflicts and remove conflicting files
    const conflicts = this.detectCaseConflicts(files);

    if (conflicts.length > 0) {
      const totalConflictedFiles = conflicts.reduce((sum, c) => sum + c.files.length, 0);
      console.warn(
        `[WSL Sync] Detected ${conflicts.length} case-sensitivity conflict(s) affecting ${totalConflictedFiles} file(s).\n` +
        `Conflicting files have been excluded from sync to prevent data corruption on Windows.\n` +
        `Please rename these files in WSL to avoid conflicts.`
      );
    }

    return { files, conflicts };
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
    const uri = vscode.Uri.file(windowsPath);

    const entries = await vscode.workspace.fs.readDirectory(uri);

    for (const [name, fileType] of entries) {
      const itemRelativePath = path.posix.join(relativePath, name);

      // Check if excluded
      if (this.isExcluded(itemRelativePath)) {
        continue;
      }

      // Validate path for Windows compatibility
      const itemFullLinuxPath = path.posix.join(basePath, itemRelativePath);
      const validationError = this.validatePath(itemFullLinuxPath);
      if (validationError) {
        // Log warning and skip this file instead of failing entire scan
        console.warn(`[WSL Sync] Skipping incompatible file: ${validationError}`);
        continue;
      }

      if (fileType === vscode.FileType.Directory) {
        // Recursively scan subdirectory
        try {
          await this.scanRecursive(basePath, itemRelativePath, files);
        } catch (error) {
          console.error(`Failed to scan directory ${itemRelativePath}:`, error);
        }
      } else if (fileType === vscode.FileType.File) {
        // Get file stats
        const itemWindowsPath = this.toWindowsPath(itemFullLinuxPath);
        const itemUri = vscode.Uri.file(itemWindowsPath);
        const stats = await vscode.workspace.fs.stat(itemUri);

        files.set(itemRelativePath, {
          mtime: stats.mtime,
          size: stats.size
        });
      }
      // Symlinks are skipped (FileType.SymbolicLink)
    }
  }

  /**
   * Download file from WSL to local Windows directory
   */
  public async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const remoteFullPath = path.posix.join(this.remotePath, remotePath);
    const windowsPath = this.toWindowsPath(remoteFullPath);
    const remoteUri = vscode.Uri.file(windowsPath);
    // Use extension-specific temp file suffix to avoid conflicts with user files
    const localTempPath = `${localPath}.remotesync.tmp`;
    const localTempUri = vscode.Uri.file(localTempPath);
    const localUri = vscode.Uri.file(localPath);

    try {
      // Ensure local directory exists
      const localDir = path.dirname(localPath);
      const localDirUri = vscode.Uri.file(localDir);
      try {
        await vscode.workspace.fs.stat(localDirUri);
      } catch {
        // Directory doesn't exist, create it
        await vscode.workspace.fs.createDirectory(localDirUri);
      }

      // Get remote file size before copying
      const remoteStats = await vscode.workspace.fs.stat(remoteUri);

      // Copy to temp file
      await vscode.workspace.fs.copy(remoteUri, localTempUri, { overwrite: true });

      // Verify file size
      const localStats = await vscode.workspace.fs.stat(localTempUri);
      if (localStats.size !== remoteStats.size) {
        await vscode.workspace.fs.delete(localTempUri);
        throw new Error(`File size mismatch: ${remotePath}`);
      }

      // Rename to final name (delete target if exists, then rename)
      try {
        await vscode.workspace.fs.delete(localUri);
      } catch {
        // Target doesn't exist, that's fine
      }
      await vscode.workspace.fs.rename(localTempUri, localUri);
    } catch (error: any) {
      // Clean up temp file on error
      try {
        await vscode.workspace.fs.delete(localTempUri);
      } catch {
        // Ignore cleanup errors
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
    const uri = vscode.Uri.file(windowsPath);

    try {
      const stats = await vscode.workspace.fs.stat(uri);

      return {
        mtime: stats.mtime,
        size: stats.size,
        isFile: stats.type === vscode.FileType.File,
        isDirectory: stats.type === vscode.FileType.Directory
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
   * Find all .remotesync.tmp files recursively (only extension-created temp files)
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
      } else if (entry.isFile() && entry.name.endsWith('.remotesync.tmp')) {
        // Only find extension-specific temp files, not user's .tmp files
        tempFiles.push(fullPath);
      }
    }

    return tempFiles;
  }
}
