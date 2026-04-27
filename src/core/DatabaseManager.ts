// Temporarily disabled - better-sqlite3 requires native compilation
// Will be replaced with alternative storage solution

import * as fs from 'fs';
import { FileSnapshot, SyncHistory, BackupFile } from '../types';

export class DatabaseManager {
  private dbPath: string;
  private data: {
    snapshots: Map<string, FileSnapshot>;
    history: SyncHistory[];
    backups: BackupFile[];
  };

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.data = {
      snapshots: new Map(),
      history: [],
      backups: []
    };
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.dbPath)) {
      try {
        const content = fs.readFileSync(this.dbPath, 'utf-8');
        const parsed = JSON.parse(content);
        this.data.snapshots = new Map(parsed.snapshots || []);
        this.data.history = parsed.history || [];
        this.data.backups = parsed.backups || [];
      } catch (error) {
        console.error('Failed to load database:', error);
      }
    }
  }

  private save(): void {
    const data = {
      snapshots: Array.from(this.data.snapshots.entries()),
      history: this.data.history,
      backups: this.data.backups
    };

    // Atomic write: write to temp file first, then rename
    const tempPath = `${this.dbPath}.tmp`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
      // Rename is atomic on most filesystems
      fs.renameSync(tempPath, this.dbPath);
    } catch (error) {
      // Clean up temp file if it exists
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  }

  public getSnapshot(projectId: string, filePath: string): FileSnapshot | null {
    const key = `${projectId}:${filePath}`;
    return this.data.snapshots.get(key) || null;
  }

  public getAllSnapshots(projectId: string): FileSnapshot[] {
    const result: FileSnapshot[] = [];
    for (const [, snapshot] of this.data.snapshots.entries()) {
      if (snapshot.projectId === projectId) {
        result.push(snapshot);
      }
    }
    return result;
  }

  public upsertSnapshot(snapshot: FileSnapshot): void {
    const key = `${snapshot.projectId}:${snapshot.filePath}`;
    this.data.snapshots.set(key, snapshot);
    this.save();
  }

  public deleteSnapshot(projectId: string, filePath: string): void {
    this.data.snapshots.delete(`${projectId}:${filePath}`);
    this.save();
  }

  public addSyncHistory(history: SyncHistory): number {
    // Use timestamp-based ID to avoid conflicts after deletions
    // Format: timestamp in milliseconds + random 3-digit number
    const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    this.data.history.push({ ...history, id });
    this.save();
    return id;
  }

  public getSyncHistory(projectId: string, limit: number = 100): SyncHistory[] {
    return this.data.history
      .filter(h => h.projectId === projectId)
      .sort((a, b) => b.syncTime - a.syncTime)
      .slice(0, limit);
  }

  public addBackupFile(backup: BackupFile): number {
    // Use timestamp-based ID to avoid conflicts after deletions
    // Format: timestamp in milliseconds + random 3-digit number
    const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    this.data.backups.push({ ...backup, id });
    this.save();
    return id;
  }

  public getBackupFiles(projectId: string, originalPath: string): BackupFile[] {
    return this.data.backups
      .filter(b => b.projectId === projectId && b.originalPath === originalPath)
      .sort((a, b) => b.backupTime - a.backupTime);
  }

  public deleteBackupFile(id: number): void {
    this.data.backups = this.data.backups.filter(b => b.id !== id);
    this.save();
  }

  public close(): void {
    this.save();
  }
}
