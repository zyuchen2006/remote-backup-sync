/**
 * Message types for communication between WebView and Extension
 *
 * Message Flow:
 * - Extension → WebView: init, testResult, validationError, browseResult
 * - WebView → Extension: save, saveAndStart, testConnection, browse, cancel
 */

// Configuration data structure
export interface ConfigFormData {
  // SSH Connection
  host: string;
  port: number;
  username: string;
  password: string;

  // Paths
  remotePath: string;
  localPath: string;

  // Sync Settings
  syncInterval: number;
  backupCount: number;

  // Exclude Patterns
  excludePatterns: string;

  // Advanced Settings
  autoStart: boolean;
}

// i18n strings for WebView
export interface I18nStrings {
  [key: string]: string;
}

// Messages from Extension to WebView
export type ExtensionMessage =
  | InitMessage
  | TestResultMessage
  | ValidationErrorMessage
  | BrowseResultMessage;

export interface InitMessage {
  type: 'init';
  mode: 'create' | 'edit';
  config: Partial<ConfigFormData>;
  i18n: I18nStrings;
  targetId?: string;
}

export interface TestResultMessage {
  type: 'testResult';
  success: boolean;
  message: string;
}

export interface ValidationErrorMessage {
  type: 'validationError';
  field: string;
  message: string;
}

export interface BrowseResultMessage {
  type: 'browseResult';
  path: string | null;
}

// Messages from WebView to Extension
export type WebViewMessage =
  | SaveMessage
  | SaveAndStartMessage
  | TestConnectionMessage
  | BrowseMessage
  | CancelMessage;

export interface SaveMessage {
  type: 'save';
  config: ConfigFormData;
}

export interface SaveAndStartMessage {
  type: 'saveAndStart';
  config: ConfigFormData;
}

export interface TestConnectionMessage {
  type: 'testConnection';
  host: string;
  port: number;
  username: string;
  password: string;
  identityFile?: string;
}

export interface BrowseMessage {
  type: 'browse';
}

export interface CancelMessage {
  type: 'cancel';
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors: { [field: string]: string };
}
