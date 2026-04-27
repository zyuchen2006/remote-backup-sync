import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RemoteSSHDetector } from '../core/RemoteSSHDetector';
import { SSHConnectionManager } from '../core/SSHConnectionManager';
import { DatabaseManager } from '../core/DatabaseManager';
import { FileSyncEngine } from '../core/FileSyncEngine';
import { LocalBackupManager } from '../core/LocalBackupManager';
import { SyncScheduler } from '../core/SyncScheduler';
import { ConfigManager } from '../core/ConfigManager';
import { StatusBarManager } from '../ui/StatusBarManager';
import { OutputChannelManager, NotificationManager } from '../ui/OutputChannelManager';
import { SyncTreeDataProvider } from '../ui/SyncTreeDataProvider';
import { SyncTarget } from '../types';
import { t } from '../utils/i18n';
import { SSHConfigReader } from '../utils/SSHConfigReader';

export class CommandManager {
  private context: vscode.ExtensionContext;
  private statusBar: StatusBarManager;
  private outputManager: OutputChannelManager;
  private notificationManager: NotificationManager;
  private treeProvider: SyncTreeDataProvider;
  private schedulers: Map<string, SyncScheduler> = new Map();
  private sshManager: SSHConnectionManager | null = null;
  // Keep single scheduler reference for backward compat
  private get scheduler(): SyncScheduler | null {
    return this.schedulers.values().next().value ?? null;
  }

  constructor(
    context: vscode.ExtensionContext,
    statusBar: StatusBarManager,
    outputManager: OutputChannelManager,
    notificationManager: NotificationManager,
    treeProvider: SyncTreeDataProvider
  ) {
    this.context = context;
    this.statusBar = statusBar;
    this.outputManager = outputManager;
    this.notificationManager = notificationManager;
    this.treeProvider = treeProvider;
  }

  /**
   * Register all commands
   */
  public registerCommands(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand('remoteSync.configure', this.configure.bind(this)),
      vscode.commands.registerCommand('remoteSync.start', this.start.bind(this)),
      vscode.commands.registerCommand('remoteSync.stop', this.stop.bind(this)),
      vscode.commands.registerCommand('remoteSync.pause', this.pause.bind(this)),
      vscode.commands.registerCommand('remoteSync.viewHistory', this.viewHistory.bind(this)),
      vscode.commands.registerCommand('remoteSync.restoreBackup', this.restoreBackup.bind(this)),
      vscode.commands.registerCommand('remoteSync.cleanBackups', this.cleanBackups.bind(this)),
      vscode.commands.registerCommand('remoteSync.showQuickActions', this.showQuickActions.bind(this)),
      vscode.commands.registerCommand('remoteSync.debugInfo', this.showDebugInfo.bind(this)),
      vscode.commands.registerCommand('remoteSync.startTarget', this.startTarget.bind(this)),
      vscode.commands.registerCommand('remoteSync.stopTarget', this.stopTarget.bind(this)),
      vscode.commands.registerCommand('remoteSync.removeTarget', this.removeTarget.bind(this))
    );
  }

  public autoStart(): void {
    const config = ConfigManager.loadConfig();
    if (config) {
      this.start().catch(err => console.error('Auto-start failed:', err));
    }
  }

  /**
   * Show debug info
   */
  private async showDebugInfo(): Promise<void> {
    const remoteName = vscode.env.remoteName;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const uri = workspaceFolder?.uri;

    const info = `
Debug Information:
  Remote Name: ${remoteName || 'undefined'}
  Workspace URI: ${uri?.toString() || 'undefined'}
  URI Scheme: ${uri?.scheme || 'undefined'}
  URI Authority: ${uri?.authority || 'undefined'}
  URI Path: ${uri?.path || 'undefined'}
  Is Remote-SSH: ${RemoteSSHDetector.isRemoteSSH()}
    `.trim();

    vscode.window.showInformationMessage(info, { modal: true });
    this.outputManager.info(info);
  }

  /**
   * Configure sync
   */
  private async configure(uri: vscode.Uri): Promise<void> {
    try {
      if (!RemoteSSHDetector.isRemoteSSH()) {
        RemoteSSHDetector.showNotRemoteSSHError();
        return;
      }

      // Get remote path from clicked folder or current workspace
      const remotePath = (uri && uri.scheme === 'vscode-remote')
        ? RemoteSSHDetector.getRemotePathFromUri(uri)
        : RemoteSSHDetector.getRemotePath();
      if (!remotePath) {
        vscode.window.showErrorMessage(t('error.noWorkspace'));
        return;
      }

      // Auto-detect host/port from SSH_CONNECTION env var, fallback to manual input
      const autoConn = RemoteSSHDetector.getSSHConnectionInfo();

      const sshHost = await vscode.window.showInputBox({
        prompt: t('dialog.sshHost'),
        placeHolder: 'my-server or 192.168.1.100',
        value: autoConn?.host || ''
      });
      if (!sshHost) {
        return;
      }

      const sshConfig = SSHConfigReader.findMatchingConfig(sshHost);
      const host = sshConfig?.hostname || sshHost;
      const port = autoConn?.port || sshConfig?.port || 22;

      const usernameInput = await vscode.window.showInputBox({
        prompt: t('dialog.sshUsername'),
        value: sshConfig?.user || process.env.USER || 'root'
      });
      if (!usernameInput) {
        return;
      }
      const username = usernameInput;

      // Ask for local path
      const localPath = await vscode.window.showInputBox({
        prompt: t('dialog.selectLocalPath'),
        placeHolder: 'D:\\projects\\myapp',
        value: `D:\\projects\\${path.basename(remotePath)}`
      });
      if (!localPath) {
        return;
      }

      const validation = ConfigManager.validateLocalPath(localPath);
      if (!validation.valid) {
        vscode.window.showErrorMessage(t('error.invalidLocalPath', validation.error || ''));
        return;
      }

      const excludeInput = await vscode.window.showInputBox({
        prompt: t('dialog.excludePatterns'),
        placeHolder: 'node_modules/**,.git/**',
        value: ConfigManager.getExcludePatterns().join(',')
      });
      const excludePatterns = excludeInput ? excludeInput.split(',').map(s => s.trim()).filter(Boolean) : ConfigManager.getExcludePatterns();

      const projectId = `${host}_${remotePath.replace(/\//g, '_')}`;
      const config = ConfigManager.loadConfig() as any || ConfigManager.createDefaultConfig(projectId, remotePath, localPath) as any;

      config.host = host;
      config.port = port;
      config.username = username;
      config.identityFile = sshConfig?.identityFile;

      if (!config.syncTargets) { config.syncTargets = []; }
      const existingIdx = config.syncTargets.findIndex((t: SyncTarget) => t.projectId === projectId);
      const newTarget: SyncTarget = { projectId, remotePath, localPath, enabled: true, excludePatterns };
      if (existingIdx >= 0) {
        config.syncTargets[existingIdx] = newTarget;
      } else {
        config.syncTargets.push(newTarget);
      }

      ConfigManager.saveConfig(config);

      this.treeProvider.addTarget(newTarget);

      const summary = `
${t('config.remotePath')}: ${username}@${host}:${port}${remotePath}
${t('config.localPath')}: ${localPath}
${t('config.syncInterval')}: ${config.syncInterval}s
${t('config.backupCount')}: ${config.backupCount}
      `.trim();

      const result = await vscode.window.showInformationMessage(
        summary, { modal: true }, t('command.start'), t('dialog.cancel')
      );

      if (result === t('command.start')) {
        await this.start();
      }
    } catch (error) {
      this.notificationManager.showErrorWithActions(
        t('error.syncFailed', (error as Error).message),
        error as Error
      );
    }
  }

  private async start(): Promise<void> {
    try {
      const config = ConfigManager.loadConfig() as any;
      if (!config) {
        vscode.window.showErrorMessage('No sync configuration found. Please configure first.');
        return;
      }

      const host: string = config.host;
      const port: number = config.port || 22;
      const username: string = config.username || 'root';
      const privateKey = config.identityFile ?
        fs.readFileSync(config.identityFile) : undefined;

      let password: string | undefined;
      if (!privateKey) {
        const secretKey = `remoteSync.password.${host}:${username}`;
        password = await this.context.secrets.get(secretKey);
        if (!password) {
          password = await vscode.window.showInputBox({ prompt: t('dialog.sshPassword'), password: true });
          if (!password) { return; }
          await this.context.secrets.store(secretKey, password);
        }
      }

      if (!this.sshManager || !this.sshManager.isConnected()) {
        this.sshManager = new SSHConnectionManager({ host, port, username, privateKey, password });
        this.outputManager.info(t('info.connecting', username, host, port));
        await this.sshManager.connect();
        this.outputManager.info(t('info.connected'));
      }

      const targets: SyncTarget[] = config.syncTargets?.length
        ? config.syncTargets
        : [{ projectId: config.projectId, remotePath: config.remotePath, localPath: config.localPath, enabled: true }];

      this.treeProvider.setTargets(targets);

      for (const target of targets) {
        if (!target.enabled || this.schedulers.get(target.projectId)?.isActive()) { continue; }

        const dbPath = ConfigManager.getDatabasePath(target.projectId);
        const dbManager = new DatabaseManager(dbPath);

        const syncEngine = new FileSyncEngine(
          target.projectId, target.remotePath, target.localPath,
          target.excludePatterns || config.excludePatterns, this.sshManager, dbManager
        );
        const backupManager = new LocalBackupManager(
          target.projectId, target.localPath, { maxBackups: config.backupCount }, dbManager
        );
        const scheduler = new SyncScheduler(
          target.projectId, syncEngine, backupManager, dbManager,
          { syncInterval: config.syncInterval, enabled: true },
          (msg) => this.outputManager.info(`[${target.remotePath}] ${msg}`)
        );
        this.setupSchedulerEventsFor(scheduler, target.projectId);
        this.schedulers.set(target.projectId, scheduler);
        scheduler.start();
      }

      this.statusBar.showIdle();
      this.notificationManager.showInfo(t('info.syncStarted'));
    } catch (error) {
      this.notificationManager.showErrorWithActions(
        t('error.connectionFailed', (error as Error).message), error as Error
      );
    }
  }

  /**
   * Stop sync
   */
  private async stop(): Promise<void> {
    if (this.schedulers.size === 0) {
      vscode.window.showInformationMessage('No sync targets running');
      return;
    }

    // Stop all schedulers and remove event listeners
    for (const scheduler of this.schedulers.values()) {
      scheduler.stop();
      scheduler.removeAllListeners();
    }
    this.schedulers.clear();

    // Disconnect SSH
    this.sshManager?.disconnect();
    this.sshManager = null;
    this.statusBar.showIdle();
    this.notificationManager.showInfo(t('info.syncStopped'));
  }

  /**
   * Pause/Resume sync
   */
  private async pause(): Promise<void> {
    if (this.schedulers.size === 0) {
      vscode.window.showWarningMessage('No sync targets configured');
      return;
    }

    const firstScheduler = this.schedulers.values().next().value;
    if (firstScheduler?.isActive()) {
      // Pause all schedulers
      for (const scheduler of this.schedulers.values()) {
        scheduler.stop();
      }
      vscode.window.showInformationMessage('All syncs paused');
    } else {
      // Resume all schedulers
      for (const scheduler of this.schedulers.values()) {
        scheduler.start();
      }
      vscode.window.showInformationMessage('All syncs resumed');
    }
  }

  /**
   * View sync history
   */
  private async viewHistory(): Promise<void> {
    vscode.window.showInformationMessage('View history feature coming soon...');
  }

  /**
   * Restore backup
   */
  private async restoreBackup(): Promise<void> {
    vscode.window.showInformationMessage('Restore backup feature coming soon...');
  }

  /**
   * Clean backups
   */
  private async cleanBackups(): Promise<void> {
    vscode.window.showInformationMessage('Clean backups feature coming soon...');
  }

  /**
   * Show quick actions menu
   */
  private async showQuickActions(): Promise<void> {
    await this.statusBar.showQuickActions();
  }

  /**
   * Setup scheduler event listeners
   */
  private setupSchedulerEventsFor(scheduler: SyncScheduler, projectId: string): void {
    scheduler.on('progress', (progress) => {
      this.treeProvider.updateStatus(projectId, progress.status as any);
      if (progress.status === 'scanning') { this.statusBar.showScanning(); }
      else if (progress.status === 'syncing') { this.statusBar.showSyncing(progress); }
      else if (progress.status === 'idle') { this.statusBar.showIdle(); }
      else if (progress.status === 'error') { this.statusBar.showError(progress.error); }
    });
    scheduler.on('syncComplete', (result) => {
      this.treeProvider.updateStatus(projectId, 'idle');

      // Check if there were any failed files
      if (result.filesFailed && result.filesFailed > 0) {
        this.notificationManager.showSyncPartialSuccess(
          result.filesAdded, result.filesModified, result.filesDeleted,
          result.filesFailed, result.failedFiles
        );
      } else {
        this.notificationManager.showSyncComplete(result.filesAdded, result.filesModified, result.filesDeleted);
      }
    });
    scheduler.on('syncError', (error) => {
      this.treeProvider.updateStatus(projectId, 'error', error.message);
      this.outputManager.error('Sync error', error);
      this.notificationManager.showSyncError(error);
    });
    scheduler.on('fileBackedUp', (data) => {
      this.notificationManager.showFileBackedUp(data.file);
    });
  }

  private setupSchedulerEvents(): void {
    if (this.scheduler) { this.setupSchedulerEventsFor(this.scheduler, ''); }
  }

  private async startTarget(item: any): Promise<void> {
    const projectId = item?.targetState?.target?.projectId;
    if (!projectId) { return; }

    const scheduler = this.schedulers.get(projectId);
    if (scheduler?.isActive()) { return; }

    const config = ConfigManager.loadConfig() as any;
    if (!config) { return; }

    const target = config.syncTargets?.find((t: SyncTarget) => t.projectId === projectId);
    if (!target) { return; }

    // Ensure SSH connection
    if (!this.sshManager || !this.sshManager.isConnected()) {
      const host: string = config.host;
      const port: number = config.port || 22;
      const username: string = config.username || 'root';
      const privateKey = config.identityFile ? fs.readFileSync(config.identityFile) : undefined;

      let password: string | undefined;
      if (!privateKey) {
        const secretKey = `remoteSync.password.${host}:${username}`;
        password = await this.context.secrets.get(secretKey);
        if (!password) {
          password = await vscode.window.showInputBox({ prompt: t('dialog.sshPassword'), password: true });
          if (!password) { return; }
          await this.context.secrets.store(secretKey, password);
        }
      }

      this.sshManager = new SSHConnectionManager({ host, port, username, privateKey, password });
      this.outputManager.info(t('info.connecting', username, host, port));
      await this.sshManager.connect();
      this.outputManager.info(t('info.connected'));
    }

    const dbPath = ConfigManager.getDatabasePath(target.projectId);
    const dbManager = new DatabaseManager(dbPath);

    const syncEngine = new FileSyncEngine(
      target.projectId, target.remotePath, target.localPath,
      target.excludePatterns || config.excludePatterns, this.sshManager, dbManager
    );
    const backupManager = new LocalBackupManager(
      target.projectId, target.localPath, { maxBackups: config.backupCount }, dbManager
    );
    const newScheduler = new SyncScheduler(
      target.projectId, syncEngine, backupManager, dbManager,
      { syncInterval: config.syncInterval, enabled: true },
      (msg) => this.outputManager.info(`[${target.remotePath}] ${msg}`)
    );
    this.setupSchedulerEventsFor(newScheduler, target.projectId);
    this.schedulers.set(target.projectId, newScheduler);
    newScheduler.start();
  }

  private stopTarget(item: any): void {
    const projectId = item?.targetState?.target?.projectId;
    if (!projectId) { return; }
    const scheduler = this.schedulers.get(projectId);
    if (scheduler) {
      scheduler.stop();

      // Remove all event listeners to prevent memory leak
      scheduler.removeAllListeners();

      this.schedulers.delete(projectId);
      this.treeProvider.updateStatus(projectId, 'stopped');

      // If no more active schedulers, disconnect SSH
      if (this.schedulers.size === 0) {
        this.sshManager?.disconnect();
        this.sshManager = null;
      }
    }
  }

  private removeTarget(item: any): void {
    const projectId = item?.targetState?.target?.projectId;
    if (!projectId) { return; }
    const scheduler = this.schedulers.get(projectId);
    if (scheduler) {
      scheduler.stop();

      // Remove all event listeners to prevent memory leak
      scheduler.removeAllListeners();
    }

    this.schedulers.delete(projectId);
    this.treeProvider.removeTarget(projectId);

    // If no more schedulers, disconnect SSH
    if (this.schedulers.size === 0) {
      this.sshManager?.disconnect();
      this.sshManager = null;
    }

    const config = ConfigManager.loadConfig() as any;
    if (config?.syncTargets) {
      config.syncTargets = config.syncTargets.filter((t: SyncTarget) => t.projectId !== projectId);
      ConfigManager.saveConfig(config);
    }
  }
}
