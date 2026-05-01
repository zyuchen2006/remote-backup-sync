import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigFormData, InitMessage, TestResultMessage, BrowseResultMessage, WebViewMessage } from './types';
import { SyncTarget } from '../../types';
import { ConfigManager } from '../../core/ConfigManager';
import { SSHConnectionManager } from '../../core/SSHConnectionManager';
import { t } from '../../utils/i18n';

/**
 * Provider for configuration WebView panel
 * Handles both create and edit modes for sync target configuration
 */
export class ConfigurationWebViewProvider {
  private static currentPanel: vscode.WebviewPanel | undefined;
  private static context: vscode.ExtensionContext;

  /**
   * Create or show the configuration WebView panel
   * @param context Extension context
   * @param targetId Target ID for edit mode (undefined for create mode)
   * @param remotePath Remote path for create mode (undefined for edit mode)
   */
  public static createOrShow(
    context: vscode.ExtensionContext,
    targetId?: string,
    remotePath?: string
  ): void {
    this.context = context;

    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel already exists, reveal it
    if (this.currentPanel) {
      this.currentPanel.reveal(column);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'remoteSyncConfig',
      targetId ? t('webview.titleEdit') : t('webview.titleCreate'),
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'dist'))
        ]
      }
    );

    this.currentPanel = panel;

    // Set HTML content
    panel.webview.html = this.getHtmlForWebview(panel.webview, context);

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
      async (message: WebViewMessage) => {
        await this.handleMessage(message, targetId);
      },
      undefined,
      context.subscriptions
    );

    // Clean up when panel is closed
    panel.onDidDispose(
      () => {
        this.currentPanel = undefined;
      },
      undefined,
      context.subscriptions
    );

    // Initialize the form
    setTimeout(() => {
      this.initializeForm(panel.webview, targetId, remotePath);
    }, 100);
  }

  /**
   * Initialize form with data
   */
  private static async initializeForm(
    webview: vscode.Webview,
    targetId?: string,
    remotePath?: string
  ): Promise<void> {
    const mode = targetId ? 'edit' : 'create';
    let config: Partial<ConfigFormData> = {};

    if (mode === 'edit' && targetId) {
      // Load existing configuration
      config = await this.loadConfigForEdit(targetId);
    } else if (remotePath) {
      // Pre-fill remote path for create mode
      config.remotePath = remotePath;

      // Auto-detect SSH connection info
      const envInfo = this.getSSHConnectionInfo();
      if (envInfo) {
        config.host = envInfo.host;
        config.port = envInfo.port;
        config.username = envInfo.username;
      }

      // Set defaults
      config.port = config.port || 22;
      config.syncInterval = ConfigManager.getSyncInterval();
      config.backupCount = ConfigManager.getBackupCount();
      config.excludePatterns = ConfigManager.getExcludePatterns().join(', ');
      config.autoStart = true;

      // Suggest local path
      if (remotePath) {
        const basename = path.basename(remotePath);
        config.localPath = `D:\\projects\\${basename}`;
      }
    }

    // Prepare i18n strings
    const i18n = this.prepareI18nStrings();

    // Send init message
    const initMessage: InitMessage = {
      type: 'init',
      mode,
      config,
      i18n,
      targetId
    };

    webview.postMessage(initMessage);
  }

  /**
   * Load configuration for edit mode
   */
  private static async loadConfigForEdit(targetId: string): Promise<Partial<ConfigFormData>> {
    const config = ConfigManager.loadConfig();
    if (!config || !config.syncTargets) {
      throw new Error('Configuration not found');
    }

    const target = config.syncTargets.find(t => t.projectId === targetId);
    if (!target) {
      throw new Error('Target not found');
    }

    // Check if password exists in keychain
    let passwordPlaceholder = '';
    if (target.host && target.username) {
      const service = `remote-sync-${target.host}`;
      const account = target.username;
      try {
        const keytar = require('keytar');
        const password = await keytar.getPassword(service, account);
        if (password) {
          passwordPlaceholder = '••••••••';
        }
      } catch (error) {
        // keytar not available or error
      }
    }

    return {
      host: target.host || config.host || '',
      port: target.port || config.port || 22,
      username: target.username || config.username || '',
      password: passwordPlaceholder,
      remotePath: target.remotePath,
      localPath: target.localPath,
      syncInterval: config.syncInterval,
      backupCount: config.backupCount,
      excludePatterns: (target.excludePatterns || config.excludePatterns || []).join(', '),
      autoStart: target.autoStart !== undefined ? target.autoStart : true
    };
  }

  /**
   * Get SSH connection info from environment
   */
  private static getSSHConnectionInfo(): { host: string; port: number; username: string } | null {
    const sshConnection = process.env.SSH_CONNECTION;
    if (!sshConnection) {
      return null;
    }

    const parts = sshConnection.split(' ');
    if (parts.length >= 4) {
      return {
        host: parts[2],
        port: parseInt(parts[3]) || 22,
        username: process.env.USER || 'root'
      };
    }

    return null;
  }

  /**
   * Prepare i18n strings for WebView
   */
  private static prepareI18nStrings(): { [key: string]: string } {
    const keys = [
      'form.titleCreate', 'form.titleEdit',
      'section.sshConnection', 'section.paths', 'section.syncSettings',
      'section.excludePatterns', 'section.advancedSettings',
      'field.host', 'field.port', 'field.username', 'field.password',
      'field.remotePath', 'field.localPath', 'field.syncInterval',
      'field.backupCount', 'field.excludePatterns', 'field.autoStart',
      'hint.password', 'hint.localPath', 'hint.syncInterval',
      'hint.backupCount', 'hint.excludePatterns', 'hint.autoStart',
      'button.testConnection', 'button.testing', 'button.browse',
      'button.save', 'button.saveAndStart', 'button.cancel',
      'error.hostRequired', 'error.portInvalid', 'error.usernameRequired',
      'error.remotePathRequired', 'error.localPathRequired', 'error.localPathInvalid',
      'error.syncIntervalInvalid', 'error.backupCountInvalid',
      'error.testConnectionMissingFields',
      'test.success', 'test.failed'
    ];

    const i18n: { [key: string]: string } = {};
    keys.forEach(key => {
      i18n[key] = t(key);
    });

    return i18n;
  }

  /**
   * Handle messages from WebView
   */
  private static async handleMessage(message: WebViewMessage, targetId?: string): Promise<void> {
    switch (message.type) {
      case 'save':
        await this.handleSave(message.config, targetId, false);
        break;
      case 'saveAndStart':
        await this.handleSave(message.config, targetId, true);
        break;
      case 'testConnection':
        await this.handleTestConnection(message);
        break;
      case 'browse':
        await this.handleBrowse();
        break;
      case 'cancel':
        this.handleCancel();
        break;
    }
  }

  /**
   * Handle save configuration
   */
  private static async handleSave(
    formData: ConfigFormData,
    targetId: string | undefined,
    startSync: boolean
  ): Promise<void> {
    try {
      // Validate configuration
      const validation = this.validateConfig(formData);
      if (!validation.valid) {
        vscode.window.showErrorMessage(t('error.invalidConfig') + ': ' + Object.values(validation.errors).join(', '));
        return;
      }

      // Save password to keychain if provided
      if (formData.password && formData.password !== '••••••••') {
        await this.savePassword(formData.host, formData.username, formData.password);
      }

      // Load existing config or create new
      let config = ConfigManager.loadConfig() || ConfigManager.createDefaultConfig(
        `${formData.host}_${formData.remotePath.replace(/\//g, '_')}`,
        formData.remotePath,
        formData.localPath
      );

      // Update global settings
      config.syncInterval = formData.syncInterval;
      config.backupCount = formData.backupCount;

      // Parse exclude patterns
      const excludePatterns = formData.excludePatterns
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);

      // Create or update sync target
      const projectId = targetId || `${formData.host}_${formData.remotePath.replace(/\//g, '_')}`;
      const newTarget: SyncTarget = {
        projectId,
        remotePath: formData.remotePath,
        localPath: formData.localPath,
        enabled: true,
        excludePatterns,
        environmentType: 'ssh',
        host: formData.host,
        port: formData.port,
        username: formData.username,
        autoStart: formData.autoStart
      };

      // Initialize syncTargets if not exists
      if (!config.syncTargets) {
        config.syncTargets = [];
      }

      // Update or add target
      const existingIndex = config.syncTargets.findIndex(t => t.projectId === projectId);
      if (existingIndex >= 0) {
        config.syncTargets[existingIndex] = newTarget;
      } else {
        config.syncTargets.push(newTarget);
      }

      // Save configuration
      ConfigManager.saveConfig(config);

      // Update tree view
      const { SyncTreeDataProvider } = await import('../SyncTreeDataProvider');
      // Tree provider will be updated by the extension

      // Close panel
      if (this.currentPanel) {
        this.currentPanel.dispose();
      }

      // Show success message
      vscode.window.showInformationMessage(
        targetId ? t('success.configUpdated') : t('success.configCreated')
      );

      // Start sync if requested
      if (startSync) {
        // Call startTarget with the correct parameter structure
        vscode.commands.executeCommand('remoteSync.startTarget', {
          targetState: {
            target: newTarget
          }
        });
      }
    } catch (error) {
      vscode.window.showErrorMessage(t('error.saveFailed') + ': ' + (error as Error).message);
    }
  }

  /**
   * Validate configuration
   */
  private static validateConfig(config: ConfigFormData): { valid: boolean; errors: { [key: string]: string } } {
    const errors: { [key: string]: string } = {};

    if (!config.host) errors.host = 'Host is required';
    if (!config.username) errors.username = 'Username is required';
    if (!config.remotePath) errors.remotePath = 'Remote path is required';
    if (!config.localPath) errors.localPath = 'Local path is required';
    if (config.port < 1 || config.port > 65535) errors.port = 'Invalid port';
    if (config.syncInterval < 10 || config.syncInterval > 3600) errors.syncInterval = 'Sync interval must be 10-3600';
    if (config.backupCount < 1 || config.backupCount > 10) errors.backupCount = 'Backup count must be 1-10';

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Save password to keychain
   */
  private static async savePassword(host: string, username: string, password: string): Promise<void> {
    try {
      const keytar = require('keytar');
      const service = `remote-sync-${host}`;
      await keytar.setPassword(service, username, password);
    } catch (error) {
      console.error('Failed to save password:', error);
      // Don't throw - password storage is optional
    }
  }

  /**
   * Handle test SSH connection
   */
  private static async handleTestConnection(message: any): Promise<void> {
    if (!this.currentPanel) return;

    try {
      const result = await this.testSSHConnection(
        message.host,
        message.port,
        message.username,
        message.password
      );

      const testResult: TestResultMessage = {
        type: 'testResult',
        success: result.success,
        message: result.message
      };

      this.currentPanel.webview.postMessage(testResult);
    } catch (error) {
      const testResult: TestResultMessage = {
        type: 'testResult',
        success: false,
        message: (error as Error).message
      };

      this.currentPanel.webview.postMessage(testResult);
    }
  }

  /**
   * Test SSH connection
   */
  private static async testSSHConnection(
    host: string,
    port: number,
    username: string,
    password: string
  ): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        manager.disconnect();
        resolve({
          success: false,
          message: t('test.timeout')
        });
      }, 10000);

      const manager = new SSHConnectionManager({
        host,
        port,
        username,
        password: password || undefined
      });

      manager.connect()
        .then(() => {
          clearTimeout(timeout);
          manager.disconnect();
          resolve({
            success: true,
            message: t('test.success')
          });
        })
        .catch((error: Error) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            message: this.parseSSHError(error)
          });
        });
    });
  }

  /**
   * Parse SSH error message
   */
  private static parseSSHError(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes('timeout')) {
      return t('test.errorTimeout');
    } else if (message.includes('authentication')) {
      return t('test.errorAuth');
    } else if (message.includes('refused')) {
      return t('test.errorRefused');
    } else if (message.includes('unreachable')) {
      return t('test.errorUnreachable');
    } else if (message.includes('host key')) {
      return t('test.errorHostKey');
    } else {
      return t('test.failed') + ': ' + error.message;
    }
  }

  /**
   * Handle browse for local path
   */
  private static async handleBrowse(): Promise<void> {
    if (!this.currentPanel) return;

    // Use a Windows local path as default to ensure dialog opens on local machine
    // This forces the dialog to open on the UI side (local Windows) rather than remote SSH
    const defaultUri = vscode.Uri.file('D:\\');

    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: t('dialog.selectFolder'),
      defaultUri: defaultUri
    });

    const browseResult: BrowseResultMessage = {
      type: 'browseResult',
      path: result && result[0] ? result[0].fsPath : null
    };

    this.currentPanel.webview.postMessage(browseResult);
  }

  /**
   * Handle cancel
   */
  private static handleCancel(): void {
    if (this.currentPanel) {
      this.currentPanel.dispose();
    }
  }

  /**
   * Get HTML for WebView
   */
  private static getHtmlForWebview(webview: vscode.Webview, context: vscode.ExtensionContext): string {
    // Read HTML template
    const htmlPath = path.join(context.extensionPath, 'src', 'ui', 'webview', 'configForm.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    // Get script URI
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, 'dist', 'configForm.js'))
    );

    // Inject script
    html = html.replace(
      '<script>',
      `<script src="${scriptUri}">`
    );

    // Update CSP to allow script
    const nonce = this.getNonce();
    html = html.replace(
      'script-src \'unsafe-inline\'',
      `script-src ${webview.cspSource} 'nonce-${nonce}'`
    );

    return html;
  }

  /**
   * Generate nonce for CSP
   */
  private static getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
