import { EventEmitter } from 'events';
import { FileSyncEngine, FileChange } from './FileSyncEngine';
import { LocalBackupManager } from './LocalBackupManager';
import { DatabaseManager } from './DatabaseManager';
import { SyncHistory } from '../types';

export interface SyncSchedulerOptions {
  syncInterval: number;
  enabled: boolean;
}

export enum SyncStatus {
  Idle = 'idle',
  Scanning = 'scanning',
  Syncing = 'syncing',
  Error = 'error'
}

export interface SyncProgress {
  status: SyncStatus;
  currentFile?: string;
  filesProcessed: number;
  totalFiles: number;
  bytesTransferred: number;
  error?: Error;
}

export class SyncScheduler extends EventEmitter {
  private syncEngine: FileSyncEngine;
  private backupManager: LocalBackupManager;
  private dbManager: DatabaseManager;
  private projectId: string;
  private options: SyncSchedulerOptions;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isSyncing = false;
  private currentProgress: SyncProgress;
  private log: (msg: string) => void;

  constructor(
    projectId: string,
    syncEngine: FileSyncEngine,
    backupManager: LocalBackupManager,
    dbManager: DatabaseManager,
    options: SyncSchedulerOptions,
    log?: (msg: string) => void
  ) {
    super();
    this.projectId = projectId;
    this.syncEngine = syncEngine;
    this.backupManager = backupManager;
    this.dbManager = dbManager;
    this.options = options;
    this.log = log || ((msg) => console.log(msg));
    this.currentProgress = {
      status: SyncStatus.Idle,
      filesProcessed: 0,
      totalFiles: 0,
      bytesTransferred: 0
    };
  }

  public start(): void {
    if (this.isRunning) { return; }
    this.isRunning = true;
    this.emit('started');
    this.runSync().catch(err => {
      this.log(`Initial sync failed: ${err.message}`);
      this.emit('syncError', err);
    });
    this.scheduleNextSync();
  }

  public stop(): void {
    if (!this.isRunning) { return; }
    this.isRunning = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.emit('stopped');
  }

  private scheduleNextSync(): void {
    if (!this.isRunning) { return; }
    this.timer = setTimeout(() => {
      this.runSync()
        .catch(err => {
          this.log(`Scheduled sync failed: ${err.message}`);
          this.emit('syncError', err);
        })
        .finally(() => this.scheduleNextSync());
    }, this.options.syncInterval * 1000);
  }

  private async runSync(): Promise<void> {
    if (this.isSyncing) {
      this.log('Sync already in progress, skipping');
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      this.updateProgress({ status: SyncStatus.Scanning, filesProcessed: 0, totalFiles: 0, bytesTransferred: 0 });
      this.log('Scanning remote directory...');

      const scanResult = await this.syncEngine.scanRemoteDirectoryWithConflicts();
      this.log(`Scan complete: ${scanResult.files.size} files found`);

      const changes = this.syncEngine.detectChangesWithConflicts(scanResult);
      this.log(`Changes detected: ${changes.length} (added/modified/deleted/skipped)`);

      if (changes.length === 0) {
        this.updateProgress({ status: SyncStatus.Idle, filesProcessed: 0, totalFiles: 0, bytesTransferred: 0 });
        this.emit('syncComplete', { filesAdded: 0, filesModified: 0, filesDeleted: 0, bytesTransferred: 0, duration: Date.now() - startTime });
        return;
      }

      this.updateProgress({ status: SyncStatus.Syncing, filesProcessed: 0, totalFiles: changes.length, bytesTransferred: 0 });

      let filesAdded = 0, filesModified = 0, filesDeleted = 0, bytesTransferred = 0;
      let filesFailed = 0;
      let filesSkipped = 0;
      const failedFiles: string[] = [];
      const skippedFiles: Array<{ path: string; reason: string }> = [];

      for (const change of changes) {
        try {
          // Handle skipped files (conflicts)
          if (change.type === 'skipped') {
            filesSkipped++;
            skippedFiles.push({ path: change.path, reason: change.reason || 'Unknown reason' });
            this.log(`Skipped ${change.path}: ${change.reason}`);
            this.currentProgress.filesProcessed++;
            this.emit('progress', { ...this.currentProgress });
            continue;
          }

          this.log(`Processing ${change.type}: ${change.path}`);
          await this.processChange(change);
          this.currentProgress.filesProcessed++;
          if (change.size) { this.currentProgress.bytesTransferred += change.size; bytesTransferred += change.size; }
          this.emit('progress', { ...this.currentProgress });
          if (change.type === 'added') { filesAdded++; }
          else if (change.type === 'modified') { filesModified++; }
          else if (change.type === 'deleted') { filesDeleted++; }
          this.log(`Done ${change.type}: ${change.path}`);
        } catch (error) {
          filesFailed++;
          failedFiles.push(change.path);
          this.log(`Failed to process ${change.path}: ${(error as Error).message}`);
          this.emit('fileError', { file: change.path, error });
        }
      }

      const history: SyncHistory = {
        projectId: this.projectId, syncTime: Date.now(),
        filesAdded, filesModified, filesDeleted, bytesTransferred,
        status: (filesFailed > 0 || filesSkipped > 0) ? 'partial_success' : 'success',
        duration: Date.now() - startTime
      };
      this.dbManager.addSyncHistory(history);

      this.updateProgress({ status: SyncStatus.Idle, filesProcessed: 0, totalFiles: 0, bytesTransferred: 0 });

      if (filesSkipped > 0) {
        this.log(`Skipped ${filesSkipped} file(s) due to conflicts:`);
        for (const { path, reason } of skippedFiles) {
          this.log(`  - ${path}: ${reason}`);
        }
      }

      if (filesFailed > 0) {
        this.log(`Sync completed with errors: +${filesAdded} ~${filesModified} -${filesDeleted}, ${filesFailed} failed, ${filesSkipped} skipped`);
        this.log(`Failed files: ${failedFiles.join(', ')}`);
      } else if (filesSkipped > 0) {
        this.log(`Sync complete with skipped files: +${filesAdded} ~${filesModified} -${filesDeleted}, ${filesSkipped} skipped`);
      } else {
        this.log(`Sync complete: +${filesAdded} ~${filesModified} -${filesDeleted}`);
      }

      this.emit('syncComplete', {
        filesAdded, filesModified, filesDeleted, bytesTransferred,
        filesFailed, failedFiles,
        duration: Date.now() - startTime
      });
    } catch (error) {
      this.log(`Sync error: ${(error as Error).message}`);
      this.updateProgress({ status: SyncStatus.Error, error: error as Error });
      const history: SyncHistory = {
        projectId: this.projectId, syncTime: Date.now(),
        filesAdded: 0, filesModified: 0, filesDeleted: 0, bytesTransferred: 0,
        status: 'failed', duration: Date.now() - startTime, error: (error as Error).message
      };
      this.dbManager.addSyncHistory(history);
      this.emit('syncError', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  private async processChange(change: FileChange): Promise<void> {
    this.updateProgress({ currentFile: change.path });

    if (change.type === 'deleted') {
      this.syncEngine.markSnapshotRemoteDeleted(change.path);
      this.emit('remoteDeleted', { file: change.path });
    } else {
      const snapshot = this.dbManager.getSnapshot(this.projectId, change.path);
      if (snapshot && this.backupManager.isLocallyModified(change.path, snapshot.localMtime)) {
        await this.backupManager.createBackup(change.path);
        this.emit('fileBackedUp', { file: change.path });
      }
      await this.syncEngine.downloadFile(change.path);
      this.syncEngine.updateSnapshot(change.path, change.remoteMtime!, change.size!);
    }
  }

  private updateProgress(update: Partial<SyncProgress>): void {
    this.currentProgress = { ...this.currentProgress, ...update };
    this.emit('progress', { ...this.currentProgress });
  }

  public getProgress(): SyncProgress { return { ...this.currentProgress }; }
  public isActive(): boolean { return this.isRunning; }
  public isSyncInProgress(): boolean { return this.isSyncing; }

  public updateInterval(intervalSeconds: number): void {
    this.options.syncInterval = intervalSeconds;
    if (this.isRunning && this.timer) { clearTimeout(this.timer); this.scheduleNextSync(); }
  }

  public async syncNow(): Promise<void> { await this.runSync(); }
}
