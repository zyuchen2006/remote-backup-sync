import * as vscode from 'vscode';
import { t } from '../utils/i18n';

export enum LogLevel {
  Debug = 'DEBUG',
  Info = 'INFO',
  Warning = 'WARNING',
  Error = 'ERROR'
}

export class OutputChannelManager {
  private outputChannel: vscode.OutputChannel;
  private logLevel: LogLevel = LogLevel.Info;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Remote Code Sync');
  }

  /**
   * Set log level
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Log debug message
   */
  public debug(message: string): void {
    if (this.shouldLog(LogLevel.Debug)) {
      this.log(LogLevel.Debug, message);
    }
  }

  /**
   * Log info message
   */
  public info(message: string): void {
    if (this.shouldLog(LogLevel.Info)) {
      this.log(LogLevel.Info, message);
    }
  }

  /**
   * Log warning message
   */
  public warning(message: string): void {
    if (this.shouldLog(LogLevel.Warning)) {
      this.log(LogLevel.Warning, message);
    }
  }

  /**
   * Log error message
   */
  public error(message: string, error?: Error): void {
    if (this.shouldLog(LogLevel.Error)) {
      let fullMessage = message;
      if (error) {
        fullMessage += `\n${error.message}`;
        if (error.stack) {
          fullMessage += `\n${error.stack}`;
        }
      }
      this.log(LogLevel.Error, fullMessage);
    }
  }

  /**
   * Check if should log at this level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.Debug, LogLevel.Info, LogLevel.Warning, LogLevel.Error];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Write log message
   */
  private log(level: LogLevel, message: string): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] ${message}`;
    this.outputChannel.appendLine(formattedMessage);
  }

  /**
   * Show output channel
   */
  public show(): void {
    this.outputChannel.show();
  }

  /**
   * Clear output channel
   */
  public clear(): void {
    this.outputChannel.clear();
  }

  /**
   * Dispose output channel
   */
  public dispose(): void {
    this.outputChannel.dispose();
  }
}

export class NotificationManager {
  private outputManager: OutputChannelManager;

  constructor(outputManager: OutputChannelManager) {
    this.outputManager = outputManager;
  }

  /**
   * Show sync error notification
   */
  public showSyncError(error: Error): void {
    this.outputManager.error('Sync error', error);

    vscode.window.showErrorMessage(
      t('notification.syncError'),
      t('notification.viewLogs'),
      t('notification.retry')
    ).then(selection => {
      if (selection === t('notification.viewLogs')) {
        this.outputManager.show();
      } else if (selection === t('notification.retry')) {
        vscode.commands.executeCommand('remoteSync.start');
      }
    });
  }

  /**
   * Show connection lost notification
   */
  public showConnectionLost(): void {
    this.outputManager.warning('Connection lost');

    vscode.window.showWarningMessage(
      t('notification.connectionLost'),
      t('notification.viewLogs')
    ).then(selection => {
      if (selection === t('notification.viewLogs')) {
        this.outputManager.show();
      }
    });
  }

  /**
   * Show reconnected notification
   */
  public showReconnected(): void {
    this.outputManager.info('Reconnected to remote server');

    vscode.window.showInformationMessage(t('notification.reconnected'));
  }

  /**
   * Show sync complete notification
   */
  public showSyncComplete(filesAdded: number, filesModified: number, filesDeleted: number): void {
    const message = t('info.syncComplete', filesAdded, filesModified, filesDeleted);
    this.outputManager.info(message);

    // Only show notification if there were changes
    if (filesAdded > 0 || filesModified > 0 || filesDeleted > 0) {
      vscode.window.showInformationMessage(message);
    }
  }

  /**
   * Show sync partial success notification (some files failed)
   */
  public showSyncPartialSuccess(
    filesAdded: number,
    filesModified: number,
    filesDeleted: number,
    filesFailed: number,
    failedFiles: string[]
  ): void {
    const message = `Sync completed with warnings: +${filesAdded} ~${filesModified} -${filesDeleted}, but ${filesFailed} file(s) failed`;
    this.outputManager.warning(message);
    this.outputManager.warning(`Failed files: ${failedFiles.join(', ')}`);

    vscode.window.showWarningMessage(
      `Sync partially completed: ${filesFailed} file(s) failed. Check logs for details.`,
      'View Logs'
    ).then(selection => {
      if (selection === 'View Logs') {
        this.outputManager.show();
      }
    });
  }

  /**
   * Show file backed up notification
   */
  public showFileBackedUp(filePath: string): void {
    const message = t('info.fileBackedUp', filePath);
    this.outputManager.info(message);
  }

  /**
   * Show error with action buttons
   */
  public showErrorWithActions(message: string, error?: Error): void {
    if (error) {
      this.outputManager.error(message, error);
    } else {
      this.outputManager.error(message);
    }

    vscode.window.showErrorMessage(
      message,
      t('notification.viewLogs'),
      t('notification.configure')
    ).then(selection => {
      if (selection === t('notification.viewLogs')) {
        this.outputManager.show();
      } else if (selection === t('notification.configure')) {
        vscode.commands.executeCommand('remoteSync.configure');
      }
    });
  }

  /**
   * Show info message
   */
  public showInfo(message: string): void {
    this.outputManager.info(message);
    vscode.window.showInformationMessage(message);
  }

  /**
   * Show warning message
   */
  public showWarning(message: string): void {
    this.outputManager.warning(message);
    vscode.window.showWarningMessage(message);
  }
}
