import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SSHConfig {
  host: string;
  hostname?: string;
  port?: number;
  user?: string;
  identityFile?: string;
  [key: string]: string | number | undefined;
}

export class SSHConfigReader {
  private static readonly SSH_CONFIG_PATH = path.join(os.homedir(), '.ssh', 'config');

  /**
   * 读取SSH配置文件
   */
  public static readConfig(): Map<string, SSHConfig> {
    const configs = new Map<string, SSHConfig>();

    if (!fs.existsSync(this.SSH_CONFIG_PATH)) {
      return configs;
    }

    try {
      const content = fs.readFileSync(this.SSH_CONFIG_PATH, 'utf-8');
      const lines = content.split('\n');

      let currentHost: string | null = null;
      let currentConfig: SSHConfig | null = null;

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        // Parse Host directive
        if (trimmed.toLowerCase().startsWith('host ')) {
          // Save previous host config
          if (currentHost && currentConfig) {
            configs.set(currentHost, currentConfig);
          }

          currentHost = trimmed.substring(5).trim();
          currentConfig = { host: currentHost };
          continue;
        }

        // Parse other directives
        if (currentConfig) {
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 2) {
            const key = parts[0].toLowerCase();
            const value = parts.slice(1).join(' ');

            switch (key) {
              case 'hostname':
                currentConfig.hostname = value;
                break;
              case 'port':
                currentConfig.port = parseInt(value);
                break;
              case 'user':
                currentConfig.user = value;
                break;
              case 'identityfile':
                currentConfig.identityFile = value.replace('~', os.homedir());
                break;
              default:
                currentConfig[key] = value;
            }
          }
        }
      }

      // Save last host config
      if (currentHost && currentConfig) {
        configs.set(currentHost, currentConfig);
      }
    } catch (error) {
      console.error('Failed to read SSH config:', error);
    }

    return configs;
  }

  /**
   * 获取特定主机的配置
   */
  public static getHostConfig(host: string): SSHConfig | null {
    const configs = this.readConfig();
    return configs.get(host) || null;
  }

  /**
   * 查找匹配的主机配置（支持通配符）
   */
  public static findMatchingConfig(hostname: string): SSHConfig | null {
    const configs = this.readConfig();

    // First try exact match
    if (configs.has(hostname)) {
      return configs.get(hostname)!;
    }

    // Try pattern matching
    for (const [pattern, config] of configs.entries()) {
      if (this.matchPattern(pattern, hostname)) {
        return config;
      }
    }

    return null;
  }

  /**
   * 简单的通配符匹配
   */
  private static matchPattern(pattern: string, hostname: string): boolean {
    if (pattern === '*') {
      return true;
    }

    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(hostname);
  }
}
