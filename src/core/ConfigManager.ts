import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SyncConfig } from '../types';

export class ConfigManager {
  private static readonly CONFIG_FILE = 'sync-config.json';
  private static context: vscode.ExtensionContext | null = null;

  /**
   * Initialize ConfigManager with extension context
   */
  public static initialize(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  /**
   * Get local storage path for config (per-workspace)
   */
  private static getStoragePath(): string {
    if (!this.context) {
      throw new Error('ConfigManager not initialized. Call initialize() first.');
    }

    // Use storageUri (per-workspace local storage)
    // If storageUri is undefined, fall back to globalStorageUri with workspace-specific subdirectory
    if (this.context.storageUri) {
      return this.context.storageUri.fsPath;
    }

    // Fallback: use globalStorageUri with workspace name as subdirectory
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || 'default';
    return path.join(this.context.globalStorageUri.fsPath, workspaceName);
  }

  /**
   * Get database path for a project
   */
  public static getDatabasePath(projectId: string): string {
    const storagePath = this.getStoragePath();
    return path.join(storagePath, `${projectId}-db.json`);
  }

  /**
   * Get sync interval from configuration
   */
  public static getSyncInterval(): number {
    const config = vscode.workspace.getConfiguration('remoteSync');
    const interval = config.get<number>('syncInterval', 60);

    // Ensure minimum 10 seconds
    return Math.max(interval, 10);
  }

  /**
   * Get backup count from configuration
   */
  public static getBackupCount(): number {
    const config = vscode.workspace.getConfiguration('remoteSync');
    const count = config.get<number>('backupCount', 3);

    // Ensure range 1-10
    return Math.max(1, Math.min(count, 10));
  }

  /**
   * Get exclude patterns from configuration
   */
  public static getExcludePatterns(): string[] {
    const config = vscode.workspace.getConfiguration('remoteSync');
    return config.get<string[]>('excludePatterns', [
      'node_modules/**',
      '.git/**',
      '.vscode/**',
      '*.log',
      '*.tmp'
    ]);
  }

  /**
   * Load sync configuration from file
   */
  public static loadConfig(): SyncConfig | null {
    const storagePath = this.getStoragePath();
    const configPath = path.join(storagePath, this.CONFIG_FILE);

    if (!fs.existsSync(configPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content) as SyncConfig;
      return config;
    } catch (error) {
      console.error('Failed to load sync config:', error);
      return null;
    }
  }

  /**
   * Save sync configuration to file
   */
  public static saveConfig(config: SyncConfig): void {
    const storagePath = this.getStoragePath();
    const configPath = path.join(storagePath, this.CONFIG_FILE);

    // Ensure storage directory exists
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    // Write config file
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Validate local path
   */
  public static validateLocalPath(localPath: string): { valid: boolean; error?: string } {
    // Support Windows paths (D:\...) even when extension runs on Linux remote
    const isAbsolute = path.isAbsolute(localPath) || /^[A-Za-z]:[\\/]/.test(localPath);
    if (!isAbsolute) {
      return { valid: false, error: 'Local path must be absolute' };
    }

    // Skip parent dir check for Windows paths when running on Linux
    const isWindowsPath = /^[A-Za-z]:[\\/]/.test(localPath);
    if (!isWindowsPath) {
      const parentDir = path.dirname(localPath);
      if (!fs.existsSync(parentDir)) {
        return { valid: false, error: 'Parent directory does not exist' };
      }
    }

    // Skip filesystem checks for Windows paths when running on Linux remote
    if (isWindowsPath) {
      return { valid: true };
    }

    try {
      if (!fs.existsSync(localPath)) {
        fs.mkdirSync(localPath, { recursive: true });
      }
      const testFile = path.join(localPath, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: `Path is not writable: ${(error as Error).message}` };
    }
  }

  /**
   * Validate exclude patterns
   */
  public static validateExcludePatterns(patterns: string[]): { valid: boolean; error?: string } {
    for (const pattern of patterns) {
      // Check for invalid characters
      if (pattern.includes('\\')) {
        return { valid: false, error: `Pattern "${pattern}" contains backslash. Use forward slash instead.` };
      }

      // Check if pattern is empty
      if (pattern.trim() === '') {
        return { valid: false, error: 'Empty pattern is not allowed' };
      }
    }

    return { valid: true };
  }

  /**
   * Get preset exclude patterns for common project types
   */
  public static getPresetPatterns(type: 'nodejs' | 'python' | 'java' | 'go' | 'rust'): string[] {
    const common = ['.git/**', '.vscode/**', '*.log', '*.tmp'];

    switch (type) {
      case 'nodejs':
        return [...common, 'node_modules/**', 'dist/**', 'build/**', '.next/**', '.nuxt/**'];

      case 'python':
        return [...common, '__pycache__/**', '*.pyc', '.venv/**', 'venv/**', '.pytest_cache/**', '*.egg-info/**'];

      case 'java':
        return [...common, 'target/**', 'build/**', '.gradle/**', '*.class', '*.jar'];

      case 'go':
        return [...common, 'vendor/**', 'bin/**', '*.exe'];

      case 'rust':
        return [...common, 'target/**', 'Cargo.lock'];

      default:
        return common;
    }
  }

  /**
   * Create default sync config
   */
  public static createDefaultConfig(
    projectId: string,
    remotePath: string,
    localPath: string
  ): SyncConfig {
    return {
      projectId,
      remotePath,
      localPath,
      syncInterval: this.getSyncInterval(),
      backupCount: this.getBackupCount(),
      excludePatterns: this.getExcludePatterns(),
      enabled: true
    };
  }

  /**
   * Validate remote accessibility (basic check)
   */
  public static async validateRemoteAccess(
    remotePath: string,
    testConnection: () => Promise<boolean>
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const accessible = await testConnection();

      if (!accessible) {
        return { valid: false, error: 'Cannot access remote path' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: `Remote access failed: ${(error as Error).message}` };
    }
  }

  /**
   * Update configuration value
   */
  public static async updateConfig(
    section: string,
    value: any,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('remoteSync');
    await config.update(section, value, target);
  }
}
