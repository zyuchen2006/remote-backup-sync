import * as vscode from 'vscode';
import { SyncStatus, SyncProgress } from '../core/SyncScheduler';
import { t } from '../utils/i18n';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private currentStatus: SyncStatus = SyncStatus.Idle;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = 'remoteSync.showQuickActions';
    this.updateDisplay();
    this.statusBarItem.show();
  }

  /**
   * Update status to idle
   */
  public showIdle(): void {
    this.currentStatus = SyncStatus.Idle;
    this.statusBarItem.text = `$(sync) ${t('status.idle')}`;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.tooltip = t('status.idle');
  }

  /**
   * Update status to scanning
   */
  public showScanning(): void {
    this.currentStatus = SyncStatus.Scanning;
    this.statusBarItem.text = `$(sync~spin) ${t('status.scanning')}`;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.tooltip = t('status.scanning');
  }

  /**
   * Update status to syncing
   */
  public showSyncing(progress: SyncProgress): void {
    this.currentStatus = SyncStatus.Syncing;
    const { filesProcessed, totalFiles } = progress;
    this.statusBarItem.text = `$(sync~spin) ${t('status.syncing', filesProcessed, totalFiles)}`;
    this.statusBarItem.backgroundColor = undefined;

    if (progress.currentFile) {
      this.statusBarItem.tooltip = `${t('status.syncing', filesProcessed, totalFiles)}\n${progress.currentFile}`;
    } else {
      this.statusBarItem.tooltip = t('status.syncing', filesProcessed, totalFiles);
    }
  }

  /**
   * Update status to error
   */
  public showError(error?: Error): void {
    this.currentStatus = SyncStatus.Error;
    this.statusBarItem.text = `$(error) ${t('status.error')}`;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');

    if (error) {
      this.statusBarItem.tooltip = `${t('status.error')}\n${error.message}`;
    } else {
      this.statusBarItem.tooltip = t('status.error');
    }
  }

  /**
   * Update display based on current status
   */
  private updateDisplay(): void {
    switch (this.currentStatus) {
      case SyncStatus.Idle:
        this.showIdle();
        break;
      case SyncStatus.Scanning:
        this.showScanning();
        break;
      case SyncStatus.Error:
        this.showError();
        break;
      default:
        this.showIdle();
    }
  }

  /**
   * Show quick actions menu
   */
  public async showQuickActions(): Promise<void> {
    const actions: vscode.QuickPickItem[] = [
      {
        label: `$(play) ${t('command.start')}`,
        description: 'Start sync scheduler'
      },
      {
        label: `$(debug-stop) ${t('command.stop')}`,
        description: 'Stop sync scheduler'
      },
      {
        label: `$(history) ${t('command.viewHistory')}`,
        description: 'View sync history'
      },
      {
        label: `$(settings-gear) ${t('command.configure')}`,
        description: 'Configure sync settings'
      }
    ];

    const selected = await vscode.window.showQuickPick(actions, {
      placeHolder: 'Select an action'
    });

    if (selected) {
      // Execute corresponding command based on selection
      if (selected.label.includes(t('command.start'))) {
        vscode.commands.executeCommand('remoteSync.start');
      } else if (selected.label.includes(t('command.stop'))) {
        vscode.commands.executeCommand('remoteSync.stop');
      } else if (selected.label.includes(t('command.viewHistory'))) {
        vscode.commands.executeCommand('remoteSync.viewHistory');
      } else if (selected.label.includes(t('command.configure'))) {
        vscode.commands.executeCommand('remoteSync.configure');
      }
    }
  }

  /**
   * Dispose status bar item
   */
  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
