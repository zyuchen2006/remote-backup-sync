import * as vscode from 'vscode';
import * as fs from 'fs';
import { OutputChannelManager, NotificationManager } from '../ui/OutputChannelManager';
import { SSHConnectionManager } from '../core/SSHConnectionManager';
import { SyncScheduler } from '../core/SyncScheduler';
import { t } from '../utils/i18n';

export class ErrorHandler {
  private outputManager: OutputChannelManager;
  private notificationManager: NotificationManager;
  private sshManager: SSHConnectionManager | null = null;
  private scheduler: SyncScheduler | null = null;

  constructor(
    outputManager: OutputChannelManager,
    notificationManager: NotificationManager
  ) {
    this.outputManager = outputManager;
    this.notificationManager = notificationManager;
  }

  /**
   * Set SSH manager for connection error handling
   */
  public setSSHManager(manager: SSHConnectionManager): void {
    this.sshManager = manager;
    this.setupSSHErrorHandlers();
  }

  /**
   * Set scheduler for sync error handling
   */
  public setScheduler(scheduler: SyncScheduler): void {
    this.scheduler = scheduler;
    this.setupSchedulerErrorHandlers();
  }

  /**
   * Setup SSH connection error handlers
   */
  private setupSSHErrorHandlers(): void {
    if (!this.sshManager) {
      return;
    }

    this.sshManager.on('error', (error: Error) => {
      this.handleNetworkError(error);
    });

    this.sshManager.on('disconnected', () => {
      this.handleDisconnection();
    });

    this.sshManager.on('connected', () => {
      this.handleReconnection();
    });
  }

  /**
   * Setup scheduler error handlers
   */
  private setupSchedulerErrorHandlers(): void {
    if (!this.scheduler) {
      return;
    }

    this.scheduler.on('syncError', (error: Error) => {
      this.handleSyncError(error);
    });

    this.scheduler.on('fileError', (data: { file: string; error: Error }) => {
      this.handleFileTransferError(data.file, data.error);
    });
  }

  /**
   * Handle network errors
   */
  private handleNetworkError(error: Error): void {
    this.outputManager.error('Network error occurred', error);

    // Check if it's a connection timeout
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      this.notificationManager.showWarning(
        'Connection timeout. The network may be unstable. Auto-reconnect will be attempted.'
      );
    } else if (error.message.includes('ECONNREFUSED')) {
      this.notificationManager.showErrorWithActions(
        'Connection refused. Please check if SSH server is running on the remote host.',
        error
      );
    } else if (error.message.includes('ENOTFOUND')) {
      this.notificationManager.showErrorWithActions(
        'Host not found. Please check the hostname or IP address.',
        error
      );
    } else {
      this.notificationManager.showErrorWithActions(
        t('error.connectionFailed', error.message),
        error
      );
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnection(): void {
    this.outputManager.warning('Disconnected from remote server');
    this.notificationManager.showConnectionLost();

    // Pause scheduler if running
    if (this.scheduler?.isActive()) {
      this.outputManager.info('Sync paused due to disconnection');
    }
  }

  /**
   * Handle reconnection
   */
  private handleReconnection(): void {
    this.outputManager.info('Reconnected to remote server');
    this.notificationManager.showReconnected();

    // Resume scheduler if it was running
    if (this.scheduler && !this.scheduler.isActive()) {
      this.scheduler.start();
      this.outputManager.info('Sync resumed after reconnection');
    }
  }

  /**
   * Handle sync errors
   */
  private handleSyncError(error: Error): void {
    this.outputManager.error('Sync error occurred', error);

    // Check error type and provide specific guidance
    if (error.message.includes('EACCES') || error.message.includes('permission denied')) {
      this.notificationManager.showErrorWithActions(
        'Permission denied. Please check file permissions on remote server.',
        error
      );
    } else if (error.message.includes('ENOSPC')) {
      this.notificationManager.showErrorWithActions(
        'No space left on device. Please free up disk space.',
        error
      );
    } else if (error.message.includes('ENOENT')) {
      this.notificationManager.showErrorWithActions(
        'File or directory not found. The remote path may have been deleted.',
        error
      );
    } else {
      this.notificationManager.showSyncError(error);
    }
  }

  /**
   * Handle file transfer errors
   */
  private handleFileTransferError(filePath: string, error: Error): void {
    this.outputManager.error(`Failed to transfer file: ${filePath}`, error);

    // Clean up temporary files if they exist
    this.cleanupTempFile(filePath);

    // File will be retried in next sync cycle
    this.outputManager.info(`File ${filePath} will be retried in next sync`);
  }

  /**
   * Clean up temporary file
   */
  private cleanupTempFile(filePath: string): void {
    try {
      // Construct temp file path
      const tempPath = `${filePath}.tmp`;

      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
        this.outputManager.debug(`Cleaned up temp file: ${tempPath}`);
      }
    } catch (error) {
      this.outputManager.warning(`Failed to clean up temp file: ${(error as Error).message}`);
    }
  }

  /**
   * Handle global uncaught errors
   */
  public handleGlobalError(error: Error): void {
    this.outputManager.error('Uncaught error', error);

    vscode.window.showErrorMessage(
      `Remote Code Sync: ${error.message}`,
      'View Logs'
    ).then(selection => {
      if (selection === 'View Logs') {
        this.outputManager.show();
      }
    });
  }

  /**
   * Log detailed error information
   */
  public logDetailedError(context: string, error: Error): void {
    this.outputManager.error(`[${context}] ${error.message}`, error);

    // Log additional context if available
    if ((error as any).code) {
      this.outputManager.debug(`Error code: ${(error as any).code}`);
    }

    if ((error as any).errno) {
      this.outputManager.debug(`Error number: ${(error as any).errno}`);
    }

    if ((error as any).syscall) {
      this.outputManager.debug(`System call: ${(error as any).syscall}`);
    }

    if ((error as any).path) {
      this.outputManager.debug(`Path: ${(error as any).path}`);
    }
  }
}
