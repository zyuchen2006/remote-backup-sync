/**
 * File information returned by file accessor
 */
export interface FileInfo {
  mtime: number;  // Modification time in milliseconds
  size: number;   // File size in bytes
}

/**
 * File statistics
 */
export interface FileStats {
  mtime: number;
  size: number;
  isFile: boolean;
  isDirectory: boolean;
}

/**
 * Scan result with optional conflict information
 */
export interface ScanResult {
  files: Map<string, FileInfo>;
  conflicts?: Array<{
    files: string[];
    reason: string;
  }>;
}

/**
 * Abstract interface for file access operations
 * Supports both SSH (via SFTP) and WSL (via direct file system access)
 */
export interface IFileAccessor {
  /**
   * Scan directory and return all files with metadata
   * @param path - Remote path to scan
   * @returns Map of relative file paths to file info
   */
  scanDirectory(path: string): Promise<Map<string, FileInfo>>;

  /**
   * Scan directory with conflict detection (optional, for WSL)
   * @param path - Remote path to scan
   * @returns Scan result with files and conflicts
   */
  scanDirectoryWithConflicts?(path: string): Promise<ScanResult>;

  /**
   * Download file from remote to local
   * @param remotePath - Remote file path (relative)
   * @param localPath - Local file path (absolute)
   */
  downloadFile(remotePath: string, localPath: string): Promise<void>;

  /**
   * Get file statistics
   * @param path - Remote file path
   * @returns File statistics
   */
  getFileStats(path: string): Promise<FileStats>;

  /**
   * Connect to remote (optional, only for SSH)
   */
  connect?(): Promise<void>;

  /**
   * Disconnect from remote (optional, only for SSH)
   */
  disconnect?(): void;
}
