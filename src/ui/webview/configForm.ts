/**
 * WebView-side logic for configuration form
 * Handles form state, validation, and communication with extension
 */

import { ConfigFormData, WebViewMessage, ExtensionMessage, ValidationResult } from './types';

// VSCode API for message passing
declare const acquireVsCodeApi: () => {
  postMessage(message: WebViewMessage): void;
  getState(): any;
  setState(state: any): void;
};

const vscode = acquireVsCodeApi();

// Form state
let formMode: 'create' | 'edit' = 'create';
let targetId: string | undefined;
let i18nStrings: { [key: string]: string } = {};
let hasPasswordStored = false;

// Validation state
const validationErrors: { [field: string]: string } = {};

/**
 * Initialize form when page loads
 */
window.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  setupAdvancedToggle();
});

/**
 * Handle messages from extension
 */
window.addEventListener('message', (event) => {
  const message: ExtensionMessage = event.data;

  switch (message.type) {
    case 'init':
      handleInit(message);
      break;
    case 'testResult':
      handleTestResult(message);
      break;
    case 'validationError':
      showFieldError(message.field, message.message);
      break;
    case 'browseResult':
      handleBrowseResult(message);
      break;
  }
});

/**
 * Initialize all event listeners
 */
function initializeEventListeners() {
  // Form submission
  const form = document.getElementById('config-form') as HTMLFormElement;
  form.addEventListener('submit', handleSave);

  // Button clicks
  document.getElementById('save')?.addEventListener('click', handleSave);
  document.getElementById('cancel')?.addEventListener('click', handleCancel);
  document.getElementById('test-connection')?.addEventListener('click', handleTestConnection);
  document.getElementById('browse')?.addEventListener('click', handleBrowse);

  // Real-time validation on blur
  const fields = ['host', 'port', 'username', 'remotePath', 'localPath', 'syncInterval', 'backupCount', 'excludePatterns'];
  fields.forEach(field => {
    const element = document.getElementById(field);
    element?.addEventListener('blur', () => validateField(field));
    element?.addEventListener('input', () => clearFieldError(field));
  });
}

/**
 * Setup advanced settings toggle
 */
function setupAdvancedToggle() {
  const toggle = document.getElementById('advanced-toggle');
  const content = document.getElementById('advanced-content');

  toggle?.addEventListener('click', () => {
    toggle.classList.toggle('expanded');
    content?.classList.toggle('visible');
  });
}

/**
 * Handle init message from extension
 */
function handleInit(message: any) {
  formMode = message.mode;
  targetId = message.targetId;
  i18nStrings = message.i18n;

  // Apply i18n strings
  applyI18n();

  // Update form title
  const title = document.getElementById('form-title');
  if (title) {
    title.textContent = formMode === 'edit'
      ? i18nStrings['form.titleEdit'] || 'Edit Configuration'
      : i18nStrings['form.titleCreate'] || 'Configure Remote Sync';
  }

  // Populate form with config data
  if (message.config) {
    populateForm(message.config);
  }
}

/**
 * Apply i18n strings to elements with data-i18n attribute
 */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (key && i18nStrings[key]) {
      if (element.tagName === 'INPUT' && (element as HTMLInputElement).placeholder) {
        (element as HTMLInputElement).placeholder = i18nStrings[key];
      } else {
        element.textContent = i18nStrings[key];
      }
    }
  });
}

/**
 * Populate form with configuration data
 */
function populateForm(config: Partial<ConfigFormData>) {
  if (config.host) (document.getElementById('host') as HTMLInputElement).value = config.host;
  if (config.port) (document.getElementById('port') as HTMLInputElement).value = String(config.port);
  if (config.username) (document.getElementById('username') as HTMLInputElement).value = config.username;
  if (config.remotePath) (document.getElementById('remotePath') as HTMLInputElement).value = config.remotePath;
  if (config.localPath) (document.getElementById('localPath') as HTMLInputElement).value = config.localPath;
  if (config.syncInterval) (document.getElementById('syncInterval') as HTMLInputElement).value = String(config.syncInterval);
  if (config.backupCount) (document.getElementById('backupCount') as HTMLInputElement).value = String(config.backupCount);
  if (config.excludePatterns) (document.getElementById('excludePatterns') as HTMLTextAreaElement).value = config.excludePatterns;
  if (config.autoStart !== undefined) (document.getElementById('autoStart') as HTMLInputElement).checked = config.autoStart;

  // Handle password placeholder for edit mode
  if (config.password === '••••••••') {
    (document.getElementById('password') as HTMLInputElement).placeholder = '••••••••';
    hasPasswordStored = true;
  }
}

/**
 * Get form data
 */
function getFormData(): ConfigFormData {
  const passwordInput = document.getElementById('password') as HTMLInputElement;
  let password = passwordInput.value;

  // If in edit mode and password field is empty, keep existing password
  if (formMode === 'edit' && !password && hasPasswordStored) {
    password = '••••••••'; // Signal to keep existing password
  }

  return {
    host: (document.getElementById('host') as HTMLInputElement).value.trim(),
    port: parseInt((document.getElementById('port') as HTMLInputElement).value),
    username: (document.getElementById('username') as HTMLInputElement).value.trim(),
    password: password,
    remotePath: (document.getElementById('remotePath') as HTMLInputElement).value.trim(),
    localPath: (document.getElementById('localPath') as HTMLInputElement).value.trim(),
    syncInterval: parseInt((document.getElementById('syncInterval') as HTMLInputElement).value),
    backupCount: parseInt((document.getElementById('backupCount') as HTMLInputElement).value),
    excludePatterns: (document.getElementById('excludePatterns') as HTMLTextAreaElement).value.trim(),
    autoStart: (document.getElementById('autoStart') as HTMLInputElement).checked
  };
}

/**
 * Validate all form fields
 */
function validateForm(): ValidationResult {
  const errors: { [field: string]: string } = {};

  // Validate host
  const host = (document.getElementById('host') as HTMLInputElement).value.trim();
  if (!host) {
    errors.host = i18nStrings['error.hostRequired'] || 'Host is required';
  }

  // Validate port
  const port = parseInt((document.getElementById('port') as HTMLInputElement).value);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.port = i18nStrings['error.portInvalid'] || 'Port must be between 1 and 65535';
  }

  // Validate username
  const username = (document.getElementById('username') as HTMLInputElement).value.trim();
  if (!username) {
    errors.username = i18nStrings['error.usernameRequired'] || 'Username is required';
  }

  // Validate remote path
  const remotePath = (document.getElementById('remotePath') as HTMLInputElement).value.trim();
  if (!remotePath) {
    errors.remotePath = i18nStrings['error.remotePathRequired'] || 'Remote path is required';
  }

  // Validate local path
  const localPath = (document.getElementById('localPath') as HTMLInputElement).value.trim();
  if (!localPath) {
    errors.localPath = i18nStrings['error.localPathRequired'] || 'Local path is required';
  } else if (!isValidWindowsPath(localPath)) {
    errors.localPath = i18nStrings['error.localPathInvalid'] || 'Must be a Windows absolute path (e.g., D:\\projects\\myapp)';
  }

  // Validate sync interval
  const syncInterval = parseInt((document.getElementById('syncInterval') as HTMLInputElement).value);
  if (isNaN(syncInterval) || syncInterval < 10 || syncInterval > 3600) {
    errors.syncInterval = i18nStrings['error.syncIntervalInvalid'] || 'Sync interval must be between 10 and 3600 seconds';
  }

  // Validate backup count
  const backupCount = parseInt((document.getElementById('backupCount') as HTMLInputElement).value);
  if (isNaN(backupCount) || backupCount < 1 || backupCount > 10) {
    errors.backupCount = i18nStrings['error.backupCountInvalid'] || 'Backup count must be between 1 and 10';
  }

  // Display errors
  Object.keys(errors).forEach(field => showFieldError(field, errors[field]));

  // Update button states
  updateButtonStates(Object.keys(errors).length === 0);

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Validate single field
 */
function validateField(field: string): boolean {
  const element = document.getElementById(field) as HTMLInputElement | HTMLTextAreaElement;
  if (!element) return true;

  const value = element.value.trim();
  let error = '';

  switch (field) {
    case 'host':
      if (!value) error = i18nStrings['error.hostRequired'] || 'Host is required';
      break;
    case 'port':
      const port = parseInt(value);
      if (isNaN(port) || port < 1 || port > 65535) {
        error = i18nStrings['error.portInvalid'] || 'Port must be between 1 and 65535';
      }
      break;
    case 'username':
      if (!value) error = i18nStrings['error.usernameRequired'] || 'Username is required';
      break;
    case 'remotePath':
      if (!value) error = i18nStrings['error.remotePathRequired'] || 'Remote path is required';
      break;
    case 'localPath':
      if (!value) {
        error = i18nStrings['error.localPathRequired'] || 'Local path is required';
      } else if (!isValidWindowsPath(value)) {
        error = i18nStrings['error.localPathInvalid'] || 'Must be a Windows absolute path';
      }
      break;
    case 'syncInterval':
      const interval = parseInt(value);
      if (isNaN(interval) || interval < 10 || interval > 3600) {
        error = i18nStrings['error.syncIntervalInvalid'] || 'Must be between 10 and 3600 seconds';
      }
      break;
    case 'backupCount':
      const count = parseInt(value);
      if (isNaN(count) || count < 1 || count > 10) {
        error = i18nStrings['error.backupCountInvalid'] || 'Must be between 1 and 10';
      }
      break;
  }

  if (error) {
    showFieldError(field, error);
    validationErrors[field] = error;
    return false;
  } else {
    clearFieldError(field);
    delete validationErrors[field];
    return true;
  }
}

/**
 * Check if path is valid Windows absolute path
 */
function isValidWindowsPath(path: string): boolean {
  // Check for Windows absolute path (e.g., C:\, D:\projects\)
  return /^[A-Za-z]:\\/.test(path);
}

/**
 * Show field error
 */
function showFieldError(field: string, message: string) {
  const errorElement = document.getElementById(`${field}-error`);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.add('visible');
  }
}

/**
 * Clear field error
 */
function clearFieldError(field: string) {
  const errorElement = document.getElementById(`${field}-error`);
  if (errorElement) {
    errorElement.textContent = '';
    errorElement.classList.remove('visible');
  }
}

/**
 * Update button states based on validation
 */
function updateButtonStates(valid: boolean) {
  const saveButton = document.getElementById('save') as HTMLButtonElement;
  const saveAndStartButton = document.getElementById('save-and-start') as HTMLButtonElement;

  if (saveButton) saveButton.disabled = !valid;
  if (saveAndStartButton) saveAndStartButton.disabled = !valid;
}

/**
 * Handle Save button click
 */
function handleSave(event: Event) {
  event.preventDefault();

  const validation = validateForm();
  if (!validation.valid) {
    return;
  }

  const config = getFormData();
  const startAfterSave = (document.getElementById('startAfterSave') as HTMLInputElement)?.checked || false;

  vscode.postMessage({
    type: startAfterSave ? 'saveAndStart' : 'save',
    config
  });
}

/**
 * Handle Cancel button click
 */
function handleCancel() {
  vscode.postMessage({
    type: 'cancel'
  });
}

/**
 * Handle Test Connection button click
 */
function handleTestConnection() {
  const host = (document.getElementById('host') as HTMLInputElement).value.trim();
  const port = parseInt((document.getElementById('port') as HTMLInputElement).value);
  const username = (document.getElementById('username') as HTMLInputElement).value.trim();
  const password = (document.getElementById('password') as HTMLInputElement).value;

  // Validate required fields
  if (!host || !username) {
    showTestResult(false, i18nStrings['error.testConnectionMissingFields'] || 'Please enter host and username');
    return;
  }

  if (isNaN(port) || port < 1 || port > 65535) {
    showTestResult(false, i18nStrings['error.portInvalid'] || 'Invalid port number');
    return;
  }

  // Show loading state
  const button = document.getElementById('test-connection') as HTMLButtonElement;
  const originalText = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span>' + (i18nStrings['button.testing'] || 'Testing...');

  // Hide previous result
  const resultElement = document.getElementById('test-result');
  if (resultElement) {
    resultElement.classList.remove('visible');
  }

  // Send test connection message
  vscode.postMessage({
    type: 'testConnection',
    host,
    port,
    username,
    password
  });

  // Reset button after timeout (will be updated by test result)
  setTimeout(() => {
    button.disabled = false;
    button.innerHTML = originalText;
  }, 15000);
}

/**
 * Handle test result from extension
 */
function handleTestResult(message: any) {
  const button = document.getElementById('test-connection') as HTMLButtonElement;
  const originalText = i18nStrings['button.testConnection'] || 'Test Connection';
  button.disabled = false;
  button.innerHTML = originalText;

  showTestResult(message.success, message.message);
}

/**
 * Show test connection result
 */
function showTestResult(success: boolean, message: string) {
  const resultElement = document.getElementById('test-result');
  if (resultElement) {
    resultElement.textContent = message;
    resultElement.className = 'test-result visible ' + (success ? 'success' : 'error');
  }
}

/**
 * Handle Browse button click
 */
function handleBrowse() {
  vscode.postMessage({
    type: 'browse'
  });
}

/**
 * Handle browse result from extension
 */
function handleBrowseResult(message: any) {
  if (message.path) {
    (document.getElementById('localPath') as HTMLInputElement).value = message.path;
    clearFieldError('localPath');
  }
}
