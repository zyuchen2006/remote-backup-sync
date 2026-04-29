import * as vscode from 'vscode';

/**
 * WSL Security Helper
 * Handles VSCode security settings for WSL UNC path access
 */
export class WSLSecurityHelper {
  /**
   * Check if wsl$ is in the allowed UNC hosts list
   */
  public static isWSLAllowed(): boolean {
    const config = vscode.workspace.getConfiguration('security');
    const allowedHosts = config.get<string[]>('allowedUNCHosts', []);
    return allowedHosts.includes('wsl$');
  }

  /**
   * Add wsl$ to the allowed UNC hosts list
   */
  public static async addWSLToAllowedHosts(): Promise<boolean> {
    try {
      const config = vscode.workspace.getConfiguration('security');
      const allowedHosts = config.get<string[]>('allowedUNCHosts', []);

      if (!allowedHosts.includes('wsl$')) {
        const updatedHosts = [...allowedHosts, 'wsl$'];
        await config.update('allowedUNCHosts', updatedHosts, vscode.ConfigurationTarget.Global);
        return true;
      }

      return false; // Already in list
    } catch (error) {
      console.error('Failed to update security.allowedUNCHosts:', error);
      return false;
    }
  }

  /**
   * Check and prompt user to allow WSL access if needed
   * Returns true if WSL access is allowed (or user allowed it), false otherwise
   */
  public static async ensureWSLAccess(): Promise<boolean> {
    if (this.isWSLAllowed()) {
      return true;
    }

    const message = 'WSL sync requires access to \\\\wsl$ UNC paths. Would you like to allow this?';
    const allow = 'Allow';
    const cancel = 'Cancel';
    const learnMore = 'Learn More';

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      allow,
      learnMore,
      cancel
    );

    if (choice === allow) {
      const success = await this.addWSLToAllowedHosts();
      if (success) {
        vscode.window.showInformationMessage(
          'WSL access enabled. The sync will start now.'
        );
        return true;
      } else {
        vscode.window.showErrorMessage(
          'Failed to update security settings. Please manually add "wsl$" to security.allowedUNCHosts in settings.'
        );
        return false;
      }
    } else if (choice === learnMore) {
      vscode.env.openExternal(
        vscode.Uri.parse('https://code.visualstudio.com/docs/editor/workspace-trust#_unc-path-access')
      );
      return false;
    }

    return false; // User cancelled
  }

  /**
   * Show manual configuration instructions
   */
  public static showManualConfigInstructions(): void {
    const message = `To enable WSL sync, please add "wsl$" to the allowed UNC hosts:

1. Open Settings (Ctrl+,)
2. Search for "security.allowedUNCHosts"
3. Click "Edit in settings.json"
4. Add "wsl$" to the array:
   "security.allowedUNCHosts": ["wsl$"]
5. Restart the sync`;

    vscode.window.showInformationMessage(
      'WSL Security Configuration Required',
      'Open Settings'
    ).then(choice => {
      if (choice === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'security.allowedUNCHosts');
      }
    });
  }
}
