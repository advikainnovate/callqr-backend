/**
 * Log Sanitizer
 * 
 * Implements secure log data sanitization to prevent personal information
 * leakage in logs while maintaining debugging capabilities.
 * 
 * Requirements: 4.5
 */

import { logger } from './logger';

/**
 * Sanitization configuration
 */
export interface SanitizationConfig {
  readonly enableSanitization: boolean;
  readonly maskingCharacter: string;
  readonly preserveLength: boolean;
  readonly logSanitizationEvents: boolean;
  readonly strictMode: boolean; // More aggressive sanitization
}

/**
 * Default sanitization configuration
 */
const DEFAULT_CONFIG: SanitizationConfig = {
  enableSanitization: true,
  maskingCharacter: '*',
  preserveLength: true,
  logSanitizationEvents: false,
  strictMode: true
};

/**
 * Personal data patterns for detection
 */
const PERSONAL_DATA_PATTERNS = {
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // Phone numbers (various formats)
  phoneUS: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  phoneIntl: /\b\+\d{1,3}[-.\s]?\d{1,14}\b/g,
  phone10Digit: /\b\d{10}\b/g,
  
  // Social Security Numbers
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  ssnNoHyphen: /\b\d{9}\b/g,
  
  // Credit card numbers
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  
  // IP addresses (when considered personal data)
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  ipv6: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
  
  // URLs with potential personal data
  urlWithParams: /https?:\/\/[^\s]+\?[^\s]*/g,
  
  // JWT tokens and similar
  jwt: /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*/g,
  
  // API keys and tokens
  apiKey: /[A-Za-z0-9]{32,}/g,
  
  // Database connection strings
  dbConnection: /(mongodb|mysql|postgresql|redis):\/\/[^\s]+/g,
  
  // Session IDs and similar
  sessionId: /[A-Fa-f0-9]{32,}/g
};

/**
 * Field names that commonly contain personal data
 */
const PERSONAL_DATA_FIELDS = new Set([
  'email', 'emailAddress', 'userEmail',
  'phone', 'phoneNumber', 'mobile', 'telephone',
  'name', 'firstName', 'lastName', 'fullName', 'username',
  'address', 'streetAddress', 'homeAddress', 'billingAddress',
  'ssn', 'socialSecurityNumber', 'taxId',
  'creditCard', 'cardNumber', 'ccNumber',
  'password', 'passwd', 'pwd', 'secret',
  'token', 'accessToken', 'refreshToken', 'authToken',
  'sessionId', 'sessionToken', 'sessionKey',
  'apiKey', 'secretKey', 'privateKey',
  'ipAddress', 'ip', 'clientIp', 'remoteIp',
  'userAgent', 'deviceId', 'fingerprint',
  'dob', 'dateOfBirth', 'birthDate',
  'emergencyContact', 'vehicleNumber'
]);

/**
 * Sanitized log entry
 */
export interface SanitizedLogEntry {
  readonly originalSize: number;
  readonly sanitizedSize: number;
  readonly sanitizationCount: number;
  readonly sanitizedData: any;
  readonly timestamp: Date;
}

/**
 * Sanitization statistics
 */
export interface SanitizationStats {
  readonly totalEntries: number;
  readonly sanitizedEntries: number;
  readonly totalReplacements: number;
  readonly averageReplacements: number;
  readonly mostCommonPatterns: Record<string, number>;
}

/**
 * Log sanitizer class
 */
export class LogSanitizer {
  private readonly config: SanitizationConfig;
  private readonly stats: SanitizationStats;
  private readonly patternCounts: Map<string, number> = new Map();

  constructor(config: Partial<SanitizationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      totalEntries: 0,
      sanitizedEntries: 0,
      totalReplacements: 0,
      averageReplacements: 0,
      mostCommonPatterns: {}
    };
  }

  /**
   * Sanitize log data
   */
  public sanitize(data: any): SanitizedLogEntry {
    if (!this.config.enableSanitization) {
      return {
        originalSize: this.getDataSize(data),
        sanitizedSize: this.getDataSize(data),
        sanitizationCount: 0,
        sanitizedData: data,
        timestamp: new Date()
      };
    }

    const originalSize = this.getDataSize(data);
    let sanitizationCount = 0;

    // Deep clone to avoid modifying original data
    const sanitizedData = this.deepClone(data);

    // Sanitize the data
    sanitizationCount = this.sanitizeRecursive(sanitizedData);

    const sanitizedSize = this.getDataSize(sanitizedData);

    // Update statistics
    this.updateStats(sanitizationCount);

    const result: SanitizedLogEntry = {
      originalSize,
      sanitizedSize,
      sanitizationCount,
      sanitizedData,
      timestamp: new Date()
    };

    if (this.config.logSanitizationEvents && sanitizationCount > 0) {
      logger.debug(`Sanitized log entry: ${sanitizationCount} replacements made`);
    }

    return result;
  }

  /**
   * Sanitize string content
   */
  public sanitizeString(content: string): { sanitized: string; replacements: number } {
    if (!this.config.enableSanitization || typeof content !== 'string') {
      return { sanitized: content, replacements: 0 };
    }

    let sanitized = content;
    let totalReplacements = 0;

    // Apply all patterns
    for (const [patternName, pattern] of Object.entries(PERSONAL_DATA_PATTERNS)) {
      const matches = sanitized.match(pattern);
      if (matches) {
        const replacements = matches.length;
        totalReplacements += replacements;
        this.incrementPatternCount(patternName, replacements);

        // Replace with masked version
        sanitized = sanitized.replace(pattern, (match) => this.maskValue(match));
      }
    }

    return { sanitized, replacements: totalReplacements };
  }

  /**
   * Check if content contains personal data
   */
  public containsPersonalData(content: any): boolean {
    if (!content) return false;

    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    
    // Check against patterns
    for (const pattern of Object.values(PERSONAL_DATA_PATTERNS)) {
      if (pattern.test(contentStr)) {
        return true;
      }
    }

    // Check field names if it's an object
    if (typeof content === 'object') {
      return this.hasPersonalDataFields(content);
    }

    return false;
  }

  /**
   * Sanitize object by field names
   */
  public sanitizeByFieldNames(obj: any): { sanitized: any; replacements: number } {
    if (!obj || typeof obj !== 'object') {
      return { sanitized: obj, replacements: 0 };
    }

    const sanitized = this.deepClone(obj);
    let totalReplacements = 0;

    const sanitizeObject = (target: any): void => {
      if (!target || typeof target !== 'object') return;

      for (const key in target) {
        if (target.hasOwnProperty(key)) {
          const lowerKey = key.toLowerCase();
          
          // Check if field name indicates personal data
          if (PERSONAL_DATA_FIELDS.has(lowerKey) || this.isPersonalDataField(lowerKey)) {
            if (target[key] !== null && target[key] !== undefined) {
              target[key] = this.maskValue(target[key]);
              totalReplacements++;
              this.incrementPatternCount('fieldName', 1);
            }
          } else if (typeof target[key] === 'object') {
            // Recursively sanitize nested objects
            sanitizeObject(target[key]);
          } else if (typeof target[key] === 'string') {
            // Sanitize string values even if field name doesn't indicate personal data
            const stringResult = this.sanitizeString(target[key]);
            target[key] = stringResult.sanitized;
            totalReplacements += stringResult.replacements;
          }
        }
      }
    };

    sanitizeObject(sanitized);
    return { sanitized, replacements: totalReplacements };
  }

  /**
   * Get sanitization statistics
   */
  public getStatistics(): SanitizationStats {
    const mostCommonPatterns: Record<string, number> = {};
    
    // Convert map to object and sort by count
    const sortedPatterns = Array.from(this.patternCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10); // Top 10

    for (const [pattern, count] of sortedPatterns) {
      mostCommonPatterns[pattern] = count;
    }

    return {
      ...this.stats,
      mostCommonPatterns,
      averageReplacements: this.stats.totalEntries > 0 
        ? this.stats.totalReplacements / this.stats.totalEntries 
        : 0
    };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    (this.stats as any).totalEntries = 0;
    (this.stats as any).sanitizedEntries = 0;
    (this.stats as any).totalReplacements = 0;
    (this.stats as any).averageReplacements = 0;
    (this.stats as any).mostCommonPatterns = {};
    this.patternCounts.clear();
  }

  /**
   * Configure sanitization
   */
  public updateConfig(newConfig: Partial<SanitizationConfig>): void {
    Object.assign(this.config as any, newConfig);
  }

  /**
   * Get current configuration
   */
  public getConfig(): SanitizationConfig {
    return { ...this.config };
  }

  /**
   * Recursively sanitize data structure
   */
  private sanitizeRecursive(data: any): number {
    let totalReplacements = 0;

    if (typeof data === 'string') {
      const result = this.sanitizeString(data);
      totalReplacements += result.replacements;
      return totalReplacements;
    }

    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        if (typeof data[i] === 'string') {
          const result = this.sanitizeString(data[i]);
          data[i] = result.sanitized;
          totalReplacements += result.replacements;
        } else if (typeof data[i] === 'object') {
          totalReplacements += this.sanitizeRecursive(data[i]);
        }
      }
      return totalReplacements;
    }

    if (typeof data === 'object' && data !== null) {
      // First sanitize by field names
      const fieldResult = this.sanitizeByFieldNames(data);
      Object.assign(data, fieldResult.sanitized);
      totalReplacements += fieldResult.replacements;

      // Then sanitize string values
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          if (typeof data[key] === 'string') {
            const result = this.sanitizeString(data[key]);
            data[key] = result.sanitized;
            totalReplacements += result.replacements;
          } else if (typeof data[key] === 'object') {
            totalReplacements += this.sanitizeRecursive(data[key]);
          }
        }
      }
    }

    return totalReplacements;
  }

  /**
   * Mask a value while preserving some structure
   */
  private maskValue(value: any): string {
    if (value === null || value === undefined) {
      return this.config.maskingCharacter.repeat(3);
    }

    const str = String(value);
    
    if (!this.config.preserveLength) {
      return this.config.maskingCharacter.repeat(3);
    }

    if (str.length <= 4) {
      return this.config.maskingCharacter.repeat(str.length);
    }

    // Preserve first and last characters for debugging
    const start = str.substring(0, 2);
    const end = str.substring(str.length - 2);
    const middle = this.config.maskingCharacter.repeat(Math.max(1, str.length - 4));
    
    return start + middle + end;
  }

  /**
   * Check if field name indicates personal data
   */
  private isPersonalDataField(fieldName: string): boolean {
    const lowerField = fieldName.toLowerCase();
    
    // Check for common patterns in field names
    const personalPatterns = [
      'email', 'mail', 'phone', 'tel', 'mobile',
      'name', 'user', 'person', 'contact',
      'address', 'location', 'street', 'city',
      'ssn', 'social', 'tax', 'id',
      'card', 'credit', 'payment',
      'password', 'secret', 'key', 'token',
      'session', 'auth', 'login',
      'ip', 'device', 'agent', 'fingerprint'
    ];

    return personalPatterns.some(pattern => lowerField.includes(pattern));
  }

  /**
   * Check if object has personal data fields
   */
  private hasPersonalDataFields(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const lowerKey = key.toLowerCase();
        if (PERSONAL_DATA_FIELDS.has(lowerKey) || this.isPersonalDataField(lowerKey)) {
          return true;
        }
        
        // Recursively check nested objects
        if (typeof obj[key] === 'object' && this.hasPersonalDataFields(obj[key])) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Deep clone object
   */
  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    
    const cloned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    return cloned;
  }

  /**
   * Get approximate size of data
   */
  private getDataSize(data: any): number {
    return JSON.stringify(data).length;
  }

  /**
   * Update statistics
   */
  private updateStats(replacements: number): void {
    (this.stats as any).totalEntries++;
    if (replacements > 0) {
      (this.stats as any).sanitizedEntries++;
      (this.stats as any).totalReplacements += replacements;
    }
  }

  /**
   * Increment pattern count
   */
  private incrementPatternCount(pattern: string, count: number): void {
    const current = this.patternCounts.get(pattern) || 0;
    this.patternCounts.set(pattern, current + count);
  }
}

/**
 * Default log sanitizer instance
 */
export const defaultLogSanitizer = new LogSanitizer();

/**
 * Convenience function to sanitize log data
 */
export function sanitizeLogData(data: any): any {
  return defaultLogSanitizer.sanitize(data).sanitizedData;
}

/**
 * Convenience function to check for personal data
 */
export function containsPersonalData(data: any): boolean {
  return defaultLogSanitizer.containsPersonalData(data);
}