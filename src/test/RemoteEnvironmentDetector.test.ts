import * as assert from 'assert';
import { RemoteEnvironmentDetector } from '../core/RemoteEnvironmentDetector';

describe('RemoteEnvironmentDetector Tests', () => {
  describe('Path Conversion', () => {
    it('should convert Linux path to Windows UNC path', () => {
      const result = RemoteEnvironmentDetector.toWindowsPath('Ubuntu', '/home/user/project');
      assert.strictEqual(result, '\\\\wsl$\\Ubuntu\\home\\user\\project');
    });

    it('should handle distribution names with version', () => {
      const result = RemoteEnvironmentDetector.toWindowsPath('Ubuntu-20.04', '/var/www');
      assert.strictEqual(result, '\\\\wsl$\\Ubuntu-20.04\\var\\www');
    });

    it('should handle paths with spaces', () => {
      const result = RemoteEnvironmentDetector.toWindowsPath('Debian', '/home/user/my project');
      assert.strictEqual(result, '\\\\wsl$\\Debian\\home\\user\\my project');
    });

    it('should normalize backslashes to forward slashes', () => {
      const result = RemoteEnvironmentDetector.toWindowsPath('Ubuntu', '/home\\user\\project');
      assert.strictEqual(result, '\\\\wsl$\\Ubuntu\\home\\user\\project');
    });
  });

  describe('WSL URI Parsing', () => {
    it('should parse standard WSL URI', () => {
      const uri = {
        scheme: 'vscode-remote',
        authority: 'wsl+Ubuntu',
        path: '/home/user/project'
      } as any;

      const result = RemoteEnvironmentDetector.parseWSLUri(uri);
      assert.ok(result);
      assert.strictEqual(result!.distroName, 'Ubuntu');
      assert.strictEqual(result!.remotePath, '/home/user/project');
    });

    it('should parse WSL URI with version suffix', () => {
      const uri = {
        scheme: 'vscode-remote',
        authority: 'wsl+Ubuntu-20.04',
        path: '/var/www/html'
      } as any;

      const result = RemoteEnvironmentDetector.parseWSLUri(uri);
      assert.ok(result);
      assert.strictEqual(result!.distroName, 'Ubuntu-20.04');
      assert.strictEqual(result!.remotePath, '/var/www/html');
    });

    it('should return null for non-WSL URI', () => {
      const uri = {
        scheme: 'vscode-remote',
        authority: 'ssh-remote+host',
        path: '/home/user/project'
      } as any;

      const result = RemoteEnvironmentDetector.parseWSLUri(uri);
      assert.strictEqual(result, null);
    });

    it('should return null for non-remote URI', () => {
      const uri = {
        scheme: 'file',
        authority: '',
        path: '/home/user/project'
      } as any;

      const result = RemoteEnvironmentDetector.parseWSLUri(uri);
      assert.strictEqual(result, null);
    });
  });

  describe('Environment Detection', () => {
    it('should detect environment type', () => {
      // Note: This test runs in local environment, so it should return null
      const envType = RemoteEnvironmentDetector.detectEnvironment();
      assert.ok(envType === null || envType === 'ssh' || envType === 'wsl');
    });

    it('should check if Remote-SSH', () => {
      const isSSH = RemoteEnvironmentDetector.isRemoteSSH();
      assert.strictEqual(typeof isSSH, 'boolean');
    });

    it('should check if WSL', () => {
      const isWSL = RemoteEnvironmentDetector.isWSL();
      assert.strictEqual(typeof isWSL, 'boolean');
    });
  });
});
