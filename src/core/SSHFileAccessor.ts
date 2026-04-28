import { SFTPWrapper } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { SSHConnectionManager } from './SSHConnectionManager';
import { IFileAccessor, FileInfo, FileStats } from './IFileAccessor';

/**
 * SSH file accessor using SFTP protocol
 */
export class SSHFileAccessor implements IFileAccessor {
  private remotePath: string;
  private excludePatterns: string[];
  private sshManager: SSHConnectionManager;

  constructor(
    remotePath: string,
    excludePatterns: string[],
    sshManager: SSHConnectionManager
  ) {
    this.remotePath = remotePath;
    this.excludePatterns = excludePatterns;
    this.sshManager = sshManager;
  }

  /**
   * Connect to SSH server
   */
  public async connect(): Promise<void> {
    await this.sshManager.connect();
  }

  /**
   * Disconnect from SSH server
   */
  public disconnect(): void {
    this.sshManager.disconnect();
  }

  /**
   * Scan directory and return all files with metadata
   */
  public async scanDirectory(basePath: string): Promise<Map<string, FileInfo>> {
    const sftp = this.sshManager.getSFTP();
    const files = new Map<string, FileInfo>();

    await this.scanRemoteRecursive(sftp, basePath, '', files);

    return files;
  }

  /**
   * Recursively scan remote directory
   */
  private async scanRemoteRecursive(
    sftp: SFTPWrapper,
    basePath: string,
    relativePath: string,
    files: Map<string, FileInfo>
  ): Promise<void> {
    const fullPath = path.posix.join(basePath, relativePath);

    return new Promise((resolve, reject) => {
      sftp.readdir(fullPath, async (err, list) => {
        if (err) {
          return reject(err);
        }

        for (const item of list) {
          const itemRelativePath = path.posix.join(relativePath, item.filename);

          // Check if excluded
          if (this.isExcluded(itemRelativePath)) {
            continue;
          }

          // Skip symlinks (only process directories and regular files)
          if (item.attrs.isDirectory()) {
            // Recursively scan subdirectory
            try {
              await this.scanRemoteRecursive(sftp, basePath, itemRelativePath, files);
            } catch (error) {
              console.error(`Failed to scan directory ${itemRelativePath}:`, error);
            }
          } else if (item.attrs.isFile()) {
            files.set(itemRelativePath, {
              mtime: item.attrs.mtime * 1000, // Convert to milliseconds
              size: item.attrs.size
            });
          }
          // Symlinks are skipped (neither isDirectory nor isFile)
        }

        resolve();
      });
    });
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
   * Download file from remote
   */
  public async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const sftp = this.sshManager.getSFTP();
    const remoteFullPath = path.posix.join(this.remotePath, remotePath);
    const localTempPath = `${localPath}.tmp`;

    // Ensure local directory exists
    const localDir = path.dirname(localPath);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      sftp.fastGet(remoteFullPath, localTempPath, (err) => {
        if (err) {
          // Clean up temp file on error
          if (fs.existsSync(localTempPath)) {
            fs.unlinkSync(localTempPath);
          }
          return reject(err);
        }

        // Verify file size
        const stats = fs.statSync(localTempPath);
        sftp.stat(remoteFullPath, (statErr, remoteStats) => {
          if (statErr) {
            fs.unlinkSync(localTempPath);
            return reject(statErr);
          }

          if (stats.size !== remoteStats.size) {
            fs.unlinkSync(localTempPath);
            return reject(new Error('File size mismatch after download'));
          }

          // Rename temp file to final name
          fs.renameSync(localTempPath, localPath);
          resolve();
        });
      });
    });
  }

  /**
   * Get file statistics
   */
  public async getFileStats(filePath: string): Promise<FileStats> {
    const sftp = this.sshManager.getSFTP();
    const fullPath = path.posix.join(this.remotePath, filePath);

    return new Promise((resolve, reject) => {
      sftp.stat(fullPath, (err, stats) => {
        if (err) {
          return reject(err);
        }

        resolve({
          mtime: stats.mtime * 1000, // Convert to milliseconds
          size: stats.size,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory()
        });
      });
    });
  }
}
