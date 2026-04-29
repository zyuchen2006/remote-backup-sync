import * as fs from 'fs';
import * as path from 'path';
import { IFileAccessor, ScanResult } from './IFileAccessor';
import { DatabaseManager } from './DatabaseManager';
import { FileSnapshot } from '../types';

export interface FileChange {
  type: 'added' | 'modified' | 'deleted' | 'skipped';
  path: string;
  remoteMtime?: number;
  size?: number;
  reason?: string; // For skipped files
}

export class FileSyncEngine {
  private projectId: string;
  private remotePath: string;
  private localPath: string;
  private accessor: IFileAccessor;
  private dbManager: DatabaseManager;

  constructor(
    projectId: string,
    remotePath: string,
    localPath: string,
    accessor: IFileAccessor,
    dbManager: DatabaseManager
  ) {
    this.projectId = projectId;
    this.remotePath = remotePath;
    this.localPath = localPath;
    this.accessor = accessor;
    this.dbManager = dbManager;
  }

  /**
   * Scan remote directory using file accessor
   */
  public async scanRemoteDirectory(): Promise<Map<string, { mtime: number; size: number }>> {
    return await this.accessor.scanDirectory(this.remotePath);
  }

  /**
   * Scan remote directory with conflict detection (for WSL)
   */
  public async scanRemoteDirectoryWithConflicts(): Promise<ScanResult> {
    if (this.accessor.scanDirectoryWithConflicts) {
      return await this.accessor.scanDirectoryWithConflicts(this.remotePath);
    }
    // Fallback for non-WSL accessors
    const files = await this.accessor.scanDirectory(this.remotePath);
    return { files };
  }

  /**
   * Detect changes by comparing with snapshots, including conflicts
   */
  public detectChangesWithConflicts(scanResult: ScanResult): FileChange[] {
    const changes = this.detectChanges(scanResult.files);

    // Add skipped files for conflicts
    if (scanResult.conflicts) {
      for (const conflict of scanResult.conflicts) {
        for (const filePath of conflict.files) {
          changes.push({
            type: 'skipped',
            path: filePath,
            reason: conflict.reason
          });
        }
      }
    }

    return changes;
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
   * Download file from remote using file accessor
   */
  public async downloadFile(remotePath: string): Promise<void> {
    const localFullPath = path.join(this.localPath, remotePath);
    await this.accessor.downloadFile(remotePath, localFullPath);
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
