/**
 * Test setup for mocking vscode module
 */
import Module = require('module');

// Create vscode mock inline
const vscodeMock = {
  env: {
    remoteName: undefined,
    appName: 'Visual Studio Code',
    appRoot: '/mock/app/root',
    language: 'en',
    machineId: 'mock-machine-id',
    sessionId: 'mock-session-id',
    uriScheme: 'vscode'
  },
  workspace: {
    workspaceFolders: undefined,
    name: undefined,
    getConfiguration: () => ({
      get: () => undefined,
      has: () => false,
      inspect: () => undefined,
      update: () => Promise.resolve()
    })
  },
  window: {
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
  },
  Uri: class Uri {
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

    static file(path: string) {
      return new Uri('file', '', path, '', '');
    }

    static parse(value: string) {
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

    toString() {
      return `${this.scheme}://${this.authority}${this.path}`;
    }
  }
};

// Mock the vscode module
const originalRequire = Module.prototype.require;

Module.prototype.require = function (this: any, id: string) {
  if (id === 'vscode') {
    return vscodeMock;
  }
  // Use original require for other modules
  return originalRequire.call(this, id);
} as any;
