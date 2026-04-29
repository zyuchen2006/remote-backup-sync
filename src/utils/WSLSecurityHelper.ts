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
    console.log('[WSLSecurityHelper] Current allowedUNCHosts:', allowedHosts);
    const isAllowed = allowedHosts.includes('wsl$');
    console.log('[WSLSecurityHelper] Is wsl$ allowed?', isAllowed);
    return isAllowed;
  }

  /**
   * Add wsl$ to the allowed UNC hosts list
   */
  public static async addWSLToAllowedHosts(): Promise<boolean> {
    try {
      console.log('[WSLSecurityHelper] Adding wsl$ to allowedUNCHosts...');
      const config = vscode.workspace.getConfiguration('security');
      const allowedHosts = config.get<string[]>('allowedUNCHosts', []);

      if (!allowedHosts.includes('wsl$')) {
        const updatedHosts = [...allowedHosts, 'wsl$'];
        console.log('[WSLSecurityHelper] Updating allowedUNCHosts to:', updatedHosts);
        await config.update('allowedUNCHosts', updatedHosts, vscode.ConfigurationTarget.Global);
        console.log('[WSLSecurityHelper] Successfully updated allowedUNCHosts');

        // Verify the update
        const newConfig = vscode.workspace.getConfiguration('security');
        const newAllowedHosts = newConfig.get<string[]>('allowedUNCHosts', []);
        console.log('[WSLSecurityHelper] Verified allowedUNCHosts:', newAllowedHosts);

        return true;
      }

      console.log('[WSLSecurityHelper] wsl$ already in allowedUNCHosts');
      return false; // Already in list
    } catch (error) {
      console.error('[WSLSecurityHelper] Failed to update security.allowedUNCHosts:', error);
      return false;
    }
  }

  /**
   * Check and prompt user to allow WSL access if needed
   * Returns true if WSL access is allowed (or user allowed it), false otherwise
   */
  public static async ensureWSLAccess(): Promise<boolean> {
    console.log('[WSLSecurityHelper] Checking WSL access...');

    if (this.isWSLAllowed()) {
      console.log('[WSLSecurityHelper] WSL access already allowed');
      return true;
    }

    console.log('[WSLSecurityHelper] WSL access not allowed, showing prompt...');

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

    console.log('[WSLSecurityHelper] User choice:', choice);

    if (choice === allow) {
      const success = await this.addWSLToAllowedHosts();
      if (success) {
        vscode.window.showInformationMessage(
          'WSL access enabled. The sync will start now.'
        );
        console.log('[WSLSecurityHelper] WSL access enabled successfully');
        return true;
      } else {
        vscode.window.showErrorMessage(
          'Failed to update security settings. Please manually add "wsl$" to security.allowedUNCHosts in settings.'
        );
        console.error('[WSLSecurityHelper] Failed to enable WSL access');
        return false;
      }
    } else if (choice === learnMore) {
      console.log('[WSLSecurityHelper] User clicked Learn More');
      vscode.env.openExternal(
        vscode.Uri.parse('https://code.visualstudio.com/docs/editor/workspace-trust#_unc-path-access')
      );
      return false;
    }

    console.log('[WSLSecurityHelper] User cancelled or closed dialog');
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
