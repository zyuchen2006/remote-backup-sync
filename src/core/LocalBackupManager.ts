import * as fs from 'fs';
import * as path from 'path';
import { DatabaseManager } from './DatabaseManager';
import { BackupFile } from '../types';

export interface BackupOptions {
  maxBackups: number; // Maximum number of backups to keep (default: 3)
}

export class LocalBackupManager {
  private projectId: string;
  private localPath: string;
  private backupDir: string;
  private options: BackupOptions;
  private dbManager: DatabaseManager;

  constructor(
    projectId: string,
    localPath: string,
    options: BackupOptions,
    dbManager: DatabaseManager
  ) {
    this.projectId = projectId;
    this.localPath = localPath;
    this.backupDir = path.join(localPath, '.sync-backups');
    this.options = options;
    this.dbManager = dbManager;

    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Check if local file has been modified since last sync
   */
  public isLocallyModified(
    filePath: string,
    lastSyncLocalMtime: number
  ): boolean {
    const localFullPath = path.join(this.localPath, filePath);

    if (!fs.existsSync(localFullPath)) {
      return false;
    }

    const stats = fs.statSync(localFullPath);
    return stats.mtimeMs > lastSyncLocalMtime;
  }

  /**
   * Create backup of local file before overwriting
   */
  public async createBackup(filePath: string): Promise<string> {
    const localFullPath = path.join(this.localPath, filePath);

    if (!fs.existsSync(localFullPath)) {
      throw new Error(`File does not exist: ${localFullPath}`);
    }

    // Generate timestamp-based backup name
    const timestamp = this.generateTimestamp();
    const backupFileName = `${filePath}.local.${timestamp}`;
    const backupFullPath = path.join(this.backupDir, backupFileName);

    // Ensure backup subdirectory exists
    const backupSubDir = path.dirname(backupFullPath);
    if (!fs.existsSync(backupSubDir)) {
      fs.mkdirSync(backupSubDir, { recursive: true });
    }

    // Copy file to backup location
    fs.copyFileSync(localFullPath, backupFullPath);

    // Get file size
    const stats = fs.statSync(backupFullPath);

    // Record backup in database
    const backupRecord: BackupFile = {
      projectId: this.projectId,
      originalPath: filePath,
      backupPath: backupFullPath,
      backupTime: Date.now(),
      fileSize: stats.size
    };

    this.dbManager.addBackupFile(backupRecord);

    // Clean up old backups
    await this.cleanupOldBackups(filePath);

    return backupFullPath;
  }

  /**
   * Generate timestamp in YYYYMMDD_HHMMSS format
   */
  private generateTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  }

  /**
   * Clean up old backups, keeping only the most recent N backups
   */
  private async cleanupOldBackups(filePath: string): Promise<void> {
    const backups = this.dbManager.getBackupFiles(this.projectId, filePath);

    // Sort by backup time (newest first)
    backups.sort((a, b) => b.backupTime - a.backupTime);

    // Delete backups beyond the limit
    const toDelete = backups.slice(this.options.maxBackups);

    for (const backup of toDelete) {
      // Delete physical file
      if (fs.existsSync(backup.backupPath)) {
        fs.unlinkSync(backup.backupPath);
      }

      // Delete database record
      if (backup.id) {
        this.dbManager.deleteBackupFile(backup.id);
      }
    }
  }

  /**
   * Get all backups for a specific file
   */
  public getBackups(filePath: string): BackupFile[] {
    return this.dbManager.getBackupFiles(this.projectId, filePath);
  }

  /**
   * Restore a backup file
   */
  public restoreBackup(backupPath: string, targetPath?: string): void {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file does not exist: ${backupPath}`);
    }

    // If no target path specified, restore to original location
    const restorePath = targetPath || backupPath.replace('.sync-backups/', '');

    // Ensure target directory exists
    const targetDir = path.dirname(restorePath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy backup to target location
    fs.copyFileSync(backupPath, restorePath);
  }

  /**
   * Delete all backups for a specific file
   */
  public deleteAllBackups(filePath: string): void {
    const backups = this.dbManager.getBackupFiles(this.projectId, filePath);

    for (const backup of backups) {
      // Delete physical file
      if (fs.existsSync(backup.backupPath)) {
        fs.unlinkSync(backup.backupPath);
      }

      // Delete database record
      if (backup.id) {
        this.dbManager.deleteBackupFile(backup.id);
      }
    }
  }

  /**
   * Get total size of all backups
   */
  public getTotalBackupSize(): number {
    const backups = this.dbManager.getBackupFiles(this.projectId, '');
    return backups.reduce((total, backup) => total + backup.fileSize, 0);
  }
}
