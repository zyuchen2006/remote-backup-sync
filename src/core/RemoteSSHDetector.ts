import * as vscode from 'vscode';
import { t } from '../utils/i18n';

export class RemoteSSHDetector {
  /**
   * 检测是否在Remote-SSH环境中
   */
  public static isRemoteSSH(): boolean {
    return vscode.env.remoteName === 'ssh-remote';
  }

  /**
   * Try to get SSH server host/port from SSH_CONNECTION env var.
   * SSH_CONNECTION format: "client_ip client_port server_ip server_port"
   */
  public static getSSHConnectionInfo(): { host: string; port: number } | null {
    const sshConn = process.env.SSH_CONNECTION;
    if (!sshConn) {
      return null;
    }
    const parts = sshConn.split(' ');
    if (parts.length < 4) {
      return null;
    }
    return { host: parts[2], port: parseInt(parts[3]) };
  }

  /**
   * 获取远程路径（workspace 当前路径）
   */
  public static getRemotePath(): string | null {
    if (!this.isRemoteSSH()) {
      return null;
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.path ?? null;
  }

  /**
   * 从URI获取远程路径
   */
  public static getRemotePathFromUri(uri: vscode.Uri): string | null {
    if (uri.scheme !== 'vscode-remote') {
      return null;
    }
    return uri.path;
  }

  /**
   * Show error for non-Remote-SSH environment
   */
  public static showNotRemoteSSHError(): void {
    vscode.window.showErrorMessage(t('error.notRemoteSSH'));
  }
}
