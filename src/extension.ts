import * as vscode from 'vscode';
import { CommandManager } from './commands/CommandManager';
import { StatusBarManager } from './ui/StatusBarManager';
import { OutputChannelManager, NotificationManager } from './ui/OutputChannelManager';
import { SyncTreeDataProvider } from './ui/SyncTreeDataProvider';
import { ConfigManager } from './core/ConfigManager';

export function activate(context: vscode.ExtensionContext) {
  // Initialize ConfigManager with extension context
  ConfigManager.initialize(context);

  const statusBar = new StatusBarManager();
  const outputManager = new OutputChannelManager();
  const notificationManager = new NotificationManager(outputManager);
  const treeProvider = new SyncTreeDataProvider();

  const treeView = vscode.window.createTreeView('remoteSyncTargets', {
    treeDataProvider: treeProvider,
    showCollapseAll: false
  });

  const commandManager = new CommandManager(
    context, statusBar, outputManager, notificationManager, treeProvider
  );
  commandManager.registerCommands();
  commandManager.autoStart();

  context.subscriptions.push(statusBar, outputManager, treeView);
}

export function deactivate() {}

