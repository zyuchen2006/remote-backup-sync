import * as vscode from 'vscode';

interface TranslationMap {
  [key: string]: string;
}

class I18n {
  private translations: TranslationMap = {};
  private locale: string;

  constructor() {
    this.locale = this.detectLocale();
    this.loadTranslations();
  }

  /**
   * Detect current locale
   */
  private detectLocale(): string {
    const vscodeLocale = vscode.env.language;

    // Support 'en' and 'zh-cn'
    if (vscodeLocale.startsWith('zh')) {
      return 'zh-cn';
    }

    return 'en';
  }

  /**
   * Load translations for current locale
   */
  private loadTranslations(): void {
    try {
      // Dynamic import based on locale
      if (this.locale === 'zh-cn') {
        this.translations = require('../../locales/zh-cn.json');
      } else {
        this.translations = require('../../locales/en.json');
      }
    } catch (error) {
      console.error('Failed to load translations:', error);
      // Fallback to empty translations
      this.translations = {};
    }
  }

  /**
   * Translate a key
   */
  public t(key: string, ...args: any[]): string {
    let text = this.translations[key] || key;

    // Replace placeholders {0}, {1}, etc.
    args.forEach((arg, index) => {
      text = text.replace(`{${index}}`, String(arg));
    });

    return text;
  }

  /**
   * Get current locale
   */
  public getLocale(): string {
    return this.locale;
  }
}

// Singleton instance
const i18n = new I18n();

/**
 * Translation function
 */
export function t(key: string, ...args: any[]): string {
  return i18n.t(key, ...args);
}

/**
 * Get current locale
 */
export function getLocale(): string {
  return i18n.getLocale();
}
