import { SFTPWrapper } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { SSHConnectionManager } from './SSHConnectionManager';
import { DatabaseManager } from './DatabaseManager';
import { FileSnapshot } from '../types';

export interface FileChange {
  type: 'added' | 'modified' | 'deleted';
  path: string;
  remoteMtime?: number;
  size?: number;
}

export class FileSyncEngine {
  private projectId: string;
  private remotePath: string;
  private localPath: string;
  private excludePatterns: string[];
  private sshManager: SSHConnectionManager;
  private dbManager: DatabaseManager;

  constructor(
    projectId: string,
    remotePath: string,
    localPath: string,
    excludePatterns: string[],
    sshManager: SSHConnectionManager,
    dbManager: DatabaseManager
  ) {
    this.projectId = projectId;
    this.remotePath = remotePath;
    this.localPath = localPath;
    this.excludePatterns = excludePatterns;
    this.sshManager = sshManager;
    this.dbManager = dbManager;
  }

  /**
   * Scan remote directory
   */
  public async scanRemoteDirectory(): Promise<Map<string, { mtime: number; size: number }>> {
    const sftp = this.sshManager.getSFTP();
    const files = new Map<string, { mtime: number; size: number }>();

    await this.scanRemoteRecursive(sftp, this.remotePath, '', files);

    return files;
  }

  /**
   * Recursively scan remote directory
   */
  private async scanRemoteRecursive(
    sftp: SFTPWrapper,
    basePath: string,
    relativePath: string,
    files: Map<string, { mtime: number; size: number }>
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
   * Detect changes by comparing with snapshots
   */
  public detectChanges(
    remoteFiles: Map<string, { mtime: number; size: number }>
  ): FileChange[] {
    const changes: FileChange[] = [];
    const snapshots = this.dbManager.getAllSnapshots(this.projectId);
    const snapshotMap = new Map(snapshots.map(s => [s.filePath, s]));

    // Check for added and modified files
    for (const [filePath, fileInfo] of remoteFiles.entries()) {
      const snapshot = snapshotMap.get(filePath);

      if (!snapshot) {
        // New file
        changes.push({
          type: 'added',
          path: filePath,
          remoteMtime: fileInfo.mtime,
          size: fileInfo.size
        });
      } else if (
        fileInfo.mtime !== snapshot.remoteMtime ||
        fileInfo.size !== snapshot.fileSize ||
        !fs.existsSync(path.join(this.localPath, filePath))
      ) {
        // Modified file
        changes.push({
          type: 'modified',
          path: filePath,
          remoteMtime: fileInfo.mtime,
          size: fileInfo.size
        });
      }

      snapshotMap.delete(filePath);
    }

    // Remaining snapshots are deleted files (skip already-marked ones)
    for (const [filePath, snapshot] of snapshotMap.entries()) {
      if (!snapshot.remoteDeleted) {
        changes.push({
          type: 'deleted',
          path: filePath
        });
      }
    }

    return changes;
  }

  /**
   * Download file from remote
   */
  public async downloadFile(remotePath: string): Promise<void> {
    const sftp = this.sshManager.getSFTP();
    const remoteFullPath = path.posix.join(this.remotePath, remotePath);
    const localFullPath = path.join(this.localPath, remotePath);
    const localTempPath = `${localFullPath}.tmp`;

    // Ensure local directory exists
    const localDir = path.dirname(localFullPath);
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
          fs.renameSync(localTempPath, localFullPath);
          resolve();
        });
      });
    });
  }

  /**
   * Mark snapshot as remote-deleted (keep-only strategy)
   */
  public markSnapshotRemoteDeleted(filePath: string): void {
    const snapshot = this.dbManager.getSnapshot(this.projectId, filePath);
    if (snapshot) {
      this.dbManager.upsertSnapshot({ ...snapshot, remoteDeleted: true });
    }
  }

  /**
   * Update snapshot after sync
   */
  public updateSnapshot(
    filePath: string,
    remoteMtime: number,
    size: number
  ): void {
    const localFullPath = path.join(this.localPath, filePath);
    const localStats = fs.existsSync(localFullPath) ? fs.statSync(localFullPath) : null;

    const snapshot: FileSnapshot = {
      projectId: this.projectId,
      filePath,
      remoteMtime,
      localMtime: localStats ? localStats.mtimeMs : Date.now(),
      fileSize: size,
      lastSyncTime: Date.now()
    };

    this.dbManager.upsertSnapshot(snapshot);
  }

  /**
   * Remove snapshot for deleted file
   */
  public removeSnapshot(filePath: string): void {
    this.dbManager.deleteSnapshot(this.projectId, filePath);
  }
}
