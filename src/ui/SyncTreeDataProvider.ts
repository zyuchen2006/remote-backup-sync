import * as vscode from 'vscode';
import { SyncTarget } from '../types';

export type TargetStatus = 'idle' | 'syncing' | 'scanning' | 'error' | 'stopped';

export interface TargetState {
  target: SyncTarget;
  status: TargetStatus;
  error?: string;
}

export class SyncTreeItem extends vscode.TreeItem {
  constructor(
    public readonly targetState: TargetState
  ) {
    super(targetState.target.remotePath, vscode.TreeItemCollapsibleState.None);
    this.description = targetState.target.localPath;
    this.tooltip = `${targetState.target.remotePath} → ${targetState.target.localPath}`;
    this.contextValue = 'syncTarget';
    this.updateIcon();
  }

  private updateIcon(): void {
    const icons: Record<TargetStatus, string> = {
      idle: 'check',
      syncing: 'sync~spin',
      scanning: 'search',
      error: 'error',
      stopped: 'circle-slash'
    };
    this.iconPath = new vscode.ThemeIcon(icons[this.targetState.status]);
  }
}

export class SyncTreeDataProvider implements vscode.TreeDataProvider<SyncTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SyncTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private states: Map<string, TargetState> = new Map();

  public setTargets(targets: SyncTarget[]): void {
    for (const target of targets) {
      if (!this.states.has(target.projectId)) {
        this.states.set(target.projectId, { target, status: 'stopped' });
      }
    }
    this._onDidChangeTreeData.fire();
  }

  public updateStatus(projectId: string, status: TargetStatus, error?: string): void {
    const state = this.states.get(projectId);
    if (state) {
      state.status = status;
      state.error = error;
      this._onDidChangeTreeData.fire();
    }
  }

  public addTarget(target: SyncTarget): void {
    this.states.set(target.projectId, { target, status: 'stopped' });
    this._onDidChangeTreeData.fire();
  }

  public removeTarget(projectId: string): void {
    this.states.delete(projectId);
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SyncTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): SyncTreeItem[] {
    return Array.from(this.states.values()).map(s => new SyncTreeItem(s));
  }
}
