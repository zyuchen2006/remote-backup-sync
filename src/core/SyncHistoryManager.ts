import { DatabaseManager } from '../core/DatabaseManager';
import { SyncHistory } from '../types';

export interface SyncStatistics {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  totalFilesAdded: number;
  totalFilesModified: number;
  totalFilesDeleted: number;
  totalBytesTransferred: number;
  averageDuration: number;
  lastSyncTime: number | null;
}

export class SyncHistoryManager {
  private dbManager: DatabaseManager;
  private projectId: string;

  constructor(projectId: string, dbManager: DatabaseManager) {
    this.projectId = projectId;
    this.dbManager = dbManager;
  }

  /**
   * Get sync history with pagination
   */
  public getHistory(limit: number = 100, offset: number = 0): SyncHistory[] {
    const allHistory = this.dbManager.getSyncHistory(this.projectId, limit + offset);
    return allHistory.slice(offset, offset + limit);
  }

  /**
   * Get recent sync history
   */
  public getRecentHistory(count: number = 10): SyncHistory[] {
    return this.dbManager.getSyncHistory(this.projectId, count);
  }

  /**
   * Get sync history by date range
   */
  public getHistoryByDateRange(startTime: number, endTime: number): SyncHistory[] {
    const allHistory = this.dbManager.getSyncHistory(this.projectId, 1000);
    return allHistory.filter(h => h.syncTime >= startTime && h.syncTime <= endTime);
  }

  /**
   * Get sync statistics
   */
  public getStatistics(): SyncStatistics {
    const allHistory = this.dbManager.getSyncHistory(this.projectId, 10000);

    if (allHistory.length === 0) {
      return {
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        totalFilesAdded: 0,
        totalFilesModified: 0,
        totalFilesDeleted: 0,
        totalBytesTransferred: 0,
        averageDuration: 0,
        lastSyncTime: null
      };
    }

    const successfulSyncs = allHistory.filter(h => h.status === 'success');
    const failedSyncs = allHistory.filter(h => h.status === 'failed');

    const totalFilesAdded = allHistory.reduce((sum, h) => sum + h.filesAdded, 0);
    const totalFilesModified = allHistory.reduce((sum, h) => sum + h.filesModified, 0);
    const totalFilesDeleted = allHistory.reduce((sum, h) => sum + h.filesDeleted, 0);
    const totalBytesTransferred = allHistory.reduce((sum, h) => sum + h.bytesTransferred, 0);
    const totalDuration = allHistory.reduce((sum, h) => sum + h.duration, 0);

    return {
      totalSyncs: allHistory.length,
      successfulSyncs: successfulSyncs.length,
      failedSyncs: failedSyncs.length,
      totalFilesAdded,
      totalFilesModified,
      totalFilesDeleted,
      totalBytesTransferred,
      averageDuration: totalDuration / allHistory.length,
      lastSyncTime: allHistory[0]?.syncTime || null
    };
  }

  /**
   * Format bytes to human readable string
   */
  public static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Format duration to human readable string
   */
  public static formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }

    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * Format timestamp to human readable string
   */
  public static formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  /**
   * Get sync history summary
   */
  public getSummary(): string {
    const stats = this.getStatistics();

    return `
Sync Statistics:
  Total Syncs: ${stats.totalSyncs}
  Successful: ${stats.successfulSyncs}
  Failed: ${stats.failedSyncs}

File Changes:
  Added: ${stats.totalFilesAdded}
  Modified: ${stats.totalFilesModified}
  Deleted: ${stats.totalFilesDeleted}

Data Transfer:
  Total: ${SyncHistoryManager.formatBytes(stats.totalBytesTransferred)}
  Average Duration: ${SyncHistoryManager.formatDuration(stats.averageDuration)}

Last Sync: ${stats.lastSyncTime ? SyncHistoryManager.formatTimestamp(stats.lastSyncTime) : 'Never'}
    `.trim();
  }

  /**
   * Clear old history (keep recent N records)
   */
  public clearOldHistory(keepCount: number = 100): void {
    const allHistory = this.dbManager.getSyncHistory(this.projectId, 10000);

    if (allHistory.length <= keepCount) {
      return;
    }

    // Sort by time (newest first)
    allHistory.sort((a, b) => b.syncTime - a.syncTime);

    // Delete old records
    const toDelete = allHistory.slice(keepCount);
    for (const record of toDelete) {
      if (record.id) {
        // Note: DatabaseManager doesn't have delete method yet
        // This would need to be implemented
        console.log(`Would delete history record ${record.id}`);
      }
    }
  }
}
