/**
 * Mock vscode module for unit tests
 */

export const env = {
  remoteName: undefined as string | undefined,
  appName: 'Visual Studio Code',
  appRoot: '/mock/app/root',
  language: 'en',
  machineId: 'mock-machine-id',
  sessionId: 'mock-session-id',
  uriScheme: 'vscode'
};

export const workspace = {
  workspaceFolders: undefined as any[] | undefined,
  name: undefined as string | undefined,
  getConfiguration: () => ({
    get: () => undefined,
    has: () => false,
    inspect: () => undefined,
    update: () => Promise.resolve()
  })
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
