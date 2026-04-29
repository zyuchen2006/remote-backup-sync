export interface RemoteInfo {
  host: string;
  username: string;
  port: number;
  remotePath: string;
}

export interface FileInfo {
  mtime: number;  // Modification time in milliseconds
  size: number;   // File size in bytes
}

export interface FileStats {
  mtime: number;
  size: number;
  isFile: boolean;
  isDirectory: boolean;
}

export interface SyncTarget {
  projectId: string;
  remotePath: string;
  localPath: string;
  enabled: boolean;
  excludePatterns?: string[];
  // Environment type: 'ssh' or 'wsl'
  environmentType?: 'ssh' | 'wsl';
  // WSL-specific fields
  distroName?: string;
  // SSH-specific fields (for per-target SSH configs)
  host?: string;
  port?: number;
  username?: string;
  identityFile?: string;
}

export interface SyncConfig {
  projectId: string;
  remotePath: string;
  localPath: string;
  syncInterval: number;
  backupCount: number;
  excludePatterns: string[];
  enabled: boolean;
  // SSH connection info
  host?: string;
  port?: number;
  username?: string;
  identityFile?: string;
  // Multiple sync targets
  syncTargets?: SyncTarget[];
}

export interface FileSnapshot {
  id?: number;
  projectId: string;
  filePath: string;
  remoteMtime: number;
  localMtime: number;
  fileSize: number;
  lastSyncTime: number;
  remoteDeleted?: boolean; // true when remote file was deleted (keep-only strategy)
}

export interface SyncHistory {
  id?: number;
  projectId: string;
  syncTime: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  bytesTransferred: number;
  duration: number;
  status: 'success' | 'partial_success' | 'failed';
  error?: string;
  filesFailed?: number;
  failedFiles?: string[];
}

export interface BackupFile {
  id?: number;
  projectId: string;
  originalPath: string;
  backupPath: string;
  backupTime: number;
  fileSize: number;
}

export enum SyncStatus {
  Idle = 'idle',
  Syncing = 'syncing',
  Success = 'success',
  Error = 'error'
}

export interface SyncProgress {
  current: number;
  total: number;
  bytesTransferred: number;
  speed: number; // bytes per second
}
