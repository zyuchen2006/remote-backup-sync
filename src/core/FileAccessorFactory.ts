import { IFileAccessor } from './IFileAccessor';
import { SSHFileAccessor } from './SSHFileAccessor';
import { WSLFileAccessor } from './WSLFileAccessor';
import { SSHConnectionManager } from './SSHConnectionManager';
import { RemoteEnvironmentInfo } from './RemoteEnvironmentDetector';

/**
 * Factory for creating file accessors based on environment type
 */
export class FileAccessorFactory {
  /**
   * Create appropriate file accessor based on remote environment info
   */
  public static createAccessor(
    remoteInfo: RemoteEnvironmentInfo,
    excludePatterns: string[],
    sshManager?: SSHConnectionManager
  ): IFileAccessor {
    if (remoteInfo.type === 'ssh') {
      if (!sshManager) {
        throw new Error('SSH connection manager is required for SSH environment');
      }
      return new SSHFileAccessor(
        remoteInfo.remotePath,
        excludePatterns,
        sshManager
      );
    }

    if (remoteInfo.type === 'wsl') {
      return new WSLFileAccessor(
        remoteInfo.distroName,
        remoteInfo.remotePath,
        excludePatterns
      );
    }

    throw new Error(`Unsupported environment type: ${(remoteInfo as any).type}`);
  }
}
