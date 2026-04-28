import * as vscode from 'vscode';
import { t } from '../utils/i18n';

export type EnvironmentType = 'ssh' | 'wsl' | null;

export interface SSHRemoteInfo {
  type: 'ssh';
  host: string;
  port: number;
  username: string;
  remotePath: string;
}

export interface WSLRemoteInfo {
  type: 'wsl';
  distroName: string;
  remotePath: string;
  windowsPath: string;
}

export type RemoteEnvironmentInfo = SSHRemoteInfo | WSLRemoteInfo;

export class RemoteEnvironmentDetector {
  /**
   * Detect current environment type
   */
  public static detectEnvironment(): EnvironmentType {
    const remoteName = vscode.env.remoteName;

    if (remoteName === 'ssh-remote') {
      return 'ssh';
    }

    if (remoteName === 'wsl') {
      return 'wsl';
    }

    return null;
  }

  /**
   * Check if in Remote-SSH environment
   */
  public static isRemoteSSH(): boolean {
    return vscode.env.remoteName === 'ssh-remote';
  }

  /**
   * Check if in Remote-WSL environment
   */
  public static isWSL(): boolean {
    return vscode.env.remoteName === 'wsl';
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
   * Get remote path (workspace current path)
   */
  public static getRemotePath(): string | null {
    const envType = this.detectEnvironment();
    if (!envType) {
      return null;
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.path ?? null;
  }

  /**
   * Get remote path from URI
   */
  public static getRemotePathFromUri(uri: vscode.Uri): string | null {
    if (uri.scheme !== 'vscode-remote') {
      return null;
    }
    return uri.path;
  }

  /**
   * Parse WSL URI to extract distribution name and path
   * Format: vscode-remote://wsl+Ubuntu/home/user/project
   * Format: vscode-remote://wsl+Ubuntu-20.04/home/user/project
   */
  public static parseWSLUri(uri: vscode.Uri): { distroName: string; remotePath: string } | null {
    if (uri.scheme !== 'vscode-remote') {
      return null;
    }

    const authority = uri.authority;
    if (!authority.startsWith('wsl+')) {
      return null;
    }

    // Extract distribution name (after "wsl+")
    const distroName = authority.substring(4);
    const remotePath = uri.path;

    return { distroName, remotePath };
  }

  /**
   * Convert WSL Linux path to Windows UNC path
   * Example: /home/user/project -> \\wsl$\Ubuntu\home\user\project
   */
  public static toWindowsPath(distroName: string, linuxPath: string): string {
    // Normalize path separators
    const normalizedPath = linuxPath.replace(/\\/g, '/');
    // Build UNC path
    return `\\\\wsl$\\${distroName}${normalizedPath}`;
  }

  /**
   * Get current workspace WSL info
   */
  public static getWSLInfo(): { distroName: string; remotePath: string; windowsPath: string } | null {
    if (!this.isWSL()) {
      return null;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return null;
    }

    const parsed = this.parseWSLUri(workspaceFolder.uri);
    if (!parsed) {
      return null;
    }

    const windowsPath = this.toWindowsPath(parsed.distroName, parsed.remotePath);

    return {
      distroName: parsed.distroName,
      remotePath: parsed.remotePath,
      windowsPath
    };
  }

  /**
   * Show error for non-remote environment
   */
  public static showNotRemoteError(): void {
    vscode.window.showErrorMessage(t('error.notRemoteEnvironment'));
  }

  /**
   * Show error for non-Remote-SSH environment (backward compatibility)
   */
  public static showNotRemoteSSHError(): void {
    this.showNotRemoteError();
  }
}
