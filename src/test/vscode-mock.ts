/**
 * Mock vscode module for unit tests
 */
import * as fs from 'fs';
import * as path from 'path';

export const env = {
  remoteName: undefined as string | undefined,
  appName: 'Visual Studio Code',
  appRoot: '/mock/app/root',
  language: 'en',
  machineId: 'mock-machine-id',
  sessionId: 'mock-session-id',
  uriScheme: 'vscode'
};

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64
}

export const workspace = {
  workspaceFolders: undefined as any[] | undefined,
  name: undefined as string | undefined,
  getConfiguration: () => ({
    get: () => undefined,
    has: () => false,
    inspect: () => undefined,
    update: () => Promise.resolve()
  }),
  fs: {
    async readDirectory(uri: Uri): Promise<[string, FileType][]> {
      const entries = await fs.promises.readdir(uri.fsPath, { withFileTypes: true });
      return entries.map(entry => {
        let type = FileType.Unknown;
        if (entry.isFile()) type = FileType.File;
        else if (entry.isDirectory()) type = FileType.Directory;
        else if (entry.isSymbolicLink()) type = FileType.SymbolicLink;
        return [entry.name, type];
      });
    },
    async stat(uri: Uri): Promise<{ type: FileType; mtime: number; size: number }> {
      const stats = await fs.promises.stat(uri.fsPath);
      let type = FileType.Unknown;
      if (stats.isFile()) type = FileType.File;
      else if (stats.isDirectory()) type = FileType.Directory;
      else if (stats.isSymbolicLink()) type = FileType.SymbolicLink;
      return {
        type,
        mtime: stats.mtimeMs,
        size: stats.size
      };
    },
    async copy(source: Uri, target: Uri, options?: { overwrite?: boolean }): Promise<void> {
      await fs.promises.copyFile(source.fsPath, target.fsPath);
    },
    async createDirectory(uri: Uri): Promise<void> {
      await fs.promises.mkdir(uri.fsPath, { recursive: true });
    },
    async delete(uri: Uri): Promise<void> {
      await fs.promises.unlink(uri.fsPath);
    },
    async rename(source: Uri, target: Uri): Promise<void> {
      await fs.promises.rename(source.fsPath, target.fsPath);
    }
  }
};

export const window = {
  showErrorMessage: (message: string) => {
    console.error('Mock showErrorMessage:', message);
    return Promise.resolve(undefined);
  },
  showWarningMessage: (message: string) => {
    console.warn('Mock showWarningMessage:', message);
    return Promise.resolve(undefined);
  },
  showInformationMessage: (message: string) => {
    console.log('Mock showInformationMessage:', message);
    return Promise.resolve(undefined);
  }
};

export class Uri {
  scheme: string;
  authority: string;
  path: string;
  query: string;
  fragment: string;
  fsPath: string;

  constructor(scheme: string, authority: string, path: string, query: string, fragment: string) {
    this.scheme = scheme;
    this.authority = authority;
    this.path = path;
    this.query = query;
    this.fragment = fragment;
    this.fsPath = path;
  }

  static file(path: string): Uri {
    return new Uri('file', '', path, '', '');
  }

  static parse(value: string): Uri {
    // Simple parse implementation
    const match = value.match(/^(\w+):\/\/([^/]*)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/);
    if (match) {
      return new Uri(
        match[1] || '',
        match[2] || '',
        match[3] || '',
        match[4] || '',
        match[5] || ''
      );
    }
    return new Uri('', '', value, '', '');
  }

  toString(): string {
    return `${this.scheme}://${this.authority}${this.path}`;
  }
}
