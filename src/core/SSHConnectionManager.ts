import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import { EventEmitter } from 'events';
import { RemoteInfo } from '../types';

export interface SSHConnectionOptions {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: Buffer;
  keepaliveInterval?: number;
}

export class SSHConnectionManager extends EventEmitter {
  private client: Client | null = null;
  private sftp: SFTPWrapper | null = null;
  private options: SSHConnectionOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private isConnecting = false;
  private intentionalDisconnect = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectingPromise: Promise<void> | null = null;

  constructor(options: SSHConnectionOptions) {
    super();
    this.options = {
      keepaliveInterval: 60000, // 60 seconds
      ...options
    };
  }

  /**
   * Connect to remote server
   */
  public async connect(): Promise<void> {
    // If already connecting, return the existing promise to avoid race condition
    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    if (this.client && this.isConnected()) {
      return;
    }

    this.isConnecting = true;

    // Create and cache the connecting promise
    this.connectingPromise = (async () => {
      try {
        await this.establishConnection();
        this.reconnectAttempts = 0;
        this.emit('connected');
      } finally {
        this.isConnecting = false;
        this.connectingPromise = null;
      }
    })();

    return this.connectingPromise;
  }

  /**
   * Establish SSH connection
   */
  private establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = new Client();

      const config: ConnectConfig = {
        host: this.options.host,
        port: this.options.port,
        username: this.options.username,
        readyTimeout: 30000,
        keepaliveInterval: this.options.keepaliveInterval
      };

      if (this.options.privateKey) {
        config.privateKey = this.options.privateKey;
      } else if (this.options.password) {
        config.password = this.options.password;
      }

      this.client.on('ready', () => {
        this.isConnecting = false;
        this.createSFTPSession()
          .then(() => resolve())
          .catch(reject);
      });

      this.client.on('error', (err) => {
        this.isConnecting = false;
        this.emit('error', err);
        reject(err);
      });

      this.client.on('close', () => {
        this.handleDisconnect();
      });

      this.client.connect(config);
    });
  }

  /**
   * Create SFTP session
   */
  private createSFTPSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new Error('SSH client not initialized'));
      }

      this.client.sftp((err, sftp) => {
        if (err) {
          return reject(err);
        }
        this.sftp = sftp;
        resolve();
      });
    });
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.client !== null && this.sftp !== null;
  }

  /**
   * Get SFTP session
   */
  public getSFTP(): SFTPWrapper {
    if (!this.sftp) {
      throw new Error('SFTP session not established');
    }
    return this.sftp;
  }

  /**
   * Get SSH client for executing commands
   */
  public getClient(): Client {
    if (!this.client) {
      throw new Error('SSH client not initialized');
    }
    return this.client;
  }

  /**
   * Handle disconnect
   */
  private handleDisconnect(): void {
    this.sftp = null;
    this.emit('disconnected');

    // Only auto-reconnect if not intentionally disconnected
    if (!this.intentionalDisconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff

      // Save timer reference so it can be cancelled
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect().catch((err) => {
          console.error('Reconnect failed:', err);
        });
      }, delay);
    }

    // Reset flag
    this.intentionalDisconnect = false;
  }

  /**
   * Disconnect
   */
  public disconnect(): void {
    this.intentionalDisconnect = true;

    // Cancel any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.client) {
      this.client.end();
      this.client = null;
    }

    this.sftp = null;
  }

  /**
   * Create connection from RemoteInfo
   */
  public static fromRemoteInfo(
    remoteInfo: RemoteInfo,
    authOptions: { password?: string; privateKey?: Buffer }
  ): SSHConnectionManager {
    return new SSHConnectionManager({
      host: remoteInfo.host,
      port: remoteInfo.port,
      username: remoteInfo.username,
      ...authOptions
    });
  }
}
