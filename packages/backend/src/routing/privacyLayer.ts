/**
 * Privacy Layer Service
 * 
 * Provides privacy protection mechanisms including anonymous ID generation,
 * data sanitization, and privacy compliance validation for the call routing system.
 * 
 * Requirements: 3.3, 3.4
 */

import { UserId, AnonymousId } from '../security/types';
import { AnonymousSessionId } from '../utils/types';
import { PrivacyValidationResult } from './types';
import { createHash, randomBytes } from 'crypto';

/**
 * Privacy layer configuration
 */
export interface PrivacyLayerConfig {
  readonly anonymousIdLength: number;
  readonly sessionIdLength: number;
  readonly enableDataSanitization: boolean;
  readonly logPrivacyViolations: boolean;
}

/**
 * Default privacy layer configuration
 */
const DEFAULT_CONFIG: PrivacyLayerConfig = {
  anonymousIdLength: 32,
  sessionIdLength: 36,
  enableDataSanitization: true,
  logPrivacyViolations: true
};

/**
 * Privacy-sensitive data patterns to detect and sanitize
 */
const PRIVACY_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
};

/**
 * Privacy layer service
 */
export class PrivacyLayer {
  private readonly config: PrivacyLayerConfig;
  private readonly userToAnonymousMap: Map<string, AnonymousId>;
  private readonly anonymousToUserMap: Map<string, UserId>;

  constructor(config: Partial<PrivacyLayerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.userToAnonymousMap = new Map();
    this.anonymousToUserMap = new Map();
  }

  /**
   * Generate anonymous ID for a user in a session context
   * 
   * @param userId - UserId to anonymize
   * @returns AnonymousId for the user
   */
  anonymizeUserForSession(userId: UserId): AnonymousId {
    // Check if we already have an anonymous ID for this user
    const existingAnonymousId = this.userToAnonymousMap.get(userId);
    if (existingAnonymousId) {
      return existingAnonymousId;
    }

    // Generate new anonymous ID
    const anonymousId = this.generateAnonymousId();
    
    // Store bidirectional mapping
    this.userToAnonymousMap.set(userId, anonymousId);
    this.anonymousToUserMap.set(anonymousId, userId);

    return anonymousId;
  }

  /**
   * Generate a new anonymous ID
   * 
   * @returns New AnonymousId
   */
  generateAnonymousId(): AnonymousId {
    const randomData = randomBytes(this.config.anonymousIdLength / 2);
    const timestamp = Date.now().toString(36);
    const hash = createHash('sha256')
      .update(randomData)
      .update(timestamp)
      .digest('hex')
      .substring(0, this.config.anonymousIdLength);
    
    return `anon_${hash}` as AnonymousId;
  }

  /**
   * Generate a new anonymous session ID
   * 
   * @returns New AnonymousSessionId
   */
  generateAnonymousSessionId(): AnonymousSessionId {
    const randomData = randomBytes(this.config.sessionIdLength / 2);
    const timestamp = Date.now().toString(36);
    const hash = createHash('sha256')
      .update(randomData)
      .update(timestamp)
      .digest('hex')
      .substring(0, this.config.sessionIdLength);
    
    return `session_${hash}` as AnonymousSessionId;
  }

  /**
   * Resolve anonymous ID back to user ID (for internal system use only)
   * 
   * @param anonymousId - AnonymousId to resolve
   * @returns UserId or null if not found
   */
  resolveAnonymousIdToUser(anonymousId: AnonymousId): UserId | null {
    return this.anonymousToUserMap.get(anonymousId) || null;
  }

  /**
   * Validate data for privacy compliance
   * 
   * @param data - Data to validate
   * @returns PrivacyValidationResult
   */
  validatePrivacyCompliance(data: any): PrivacyValidationResult {
    const violations: string[] = [];
    let sanitizedData = data;

    if (typeof data === 'string') {
      // Check for privacy-sensitive patterns
      for (const [patternName, pattern] of Object.entries(PRIVACY_PATTERNS)) {
        if (pattern.test(data)) {
          violations.push(`Contains ${patternName} pattern`);
        }
      }

      // Sanitize if enabled
      if (this.config.enableDataSanitization && violations.length > 0) {
        sanitizedData = this.sanitizeString(data);
      }
    } else if (typeof data === 'object' && data !== null) {
      // Recursively check object properties
      const result = this.validateObjectPrivacy(data);
      violations.push(...result.violations);
      sanitizedData = result.sanitizedData;
    }

    // Log violations if enabled
    if (this.config.logPrivacyViolations && violations.length > 0) {
      console.warn('Privacy violations detected:', violations);
    }

    return {
      compliant: violations.length === 0,
      violations,
      sanitizedData
    };
  }

  /**
   * Sanitize log data to remove personal information
   * 
   * @param logEntry - Log entry to sanitize
   * @returns Sanitized log entry
   */
  sanitizeLogData(logEntry: any): any {
    if (typeof logEntry === 'string') {
      return this.sanitizeString(logEntry);
    }

    if (typeof logEntry === 'object' && logEntry !== null) {
      const sanitized: any = {};
      
      for (const [key, value] of Object.entries(logEntry)) {
        // Skip potentially sensitive fields
        if (this.isSensitiveField(key)) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'string') {
          sanitized[key] = this.sanitizeString(value);
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitizeLogData(value);
        } else {
          sanitized[key] = value;
        }
      }
      
      return sanitized;
    }

    return logEntry;
  }

  /**
   * Clear anonymous ID mappings (for session cleanup)
   * 
   * @param anonymousId - AnonymousId to clear
   */
  clearAnonymousMapping(anonymousId: AnonymousId): void {
    const userId = this.anonymousToUserMap.get(anonymousId);
    if (userId) {
      this.userToAnonymousMap.delete(userId);
      this.anonymousToUserMap.delete(anonymousId);
    }
  }

  /**
   * Clear all mappings (for system cleanup)
   */
  clearAllMappings(): void {
    this.userToAnonymousMap.clear();
    this.anonymousToUserMap.clear();
  }

  /**
   * Clean up session data for privacy compliance
   * 
   * @param sessionId - Session ID to clean up
   */
  cleanupSessionData(sessionId: AnonymousSessionId): void {
    // In a real implementation, this would clean up any temporary data
    // associated with the session for privacy compliance
    console.log(`Cleaning up session data for session: ${sessionId}`);
  }

  /**
   * Get current mapping statistics (for monitoring)
   * 
   * @returns Mapping statistics
   */
  getMappingStats(): { userMappings: number; anonymousMappings: number } {
    return {
      userMappings: this.userToAnonymousMap.size,
      anonymousMappings: this.anonymousToUserMap.size
    };
  }

  /**
   * Sanitize string by removing privacy-sensitive patterns
   * 
   * @param text - Text to sanitize
   * @returns Sanitized text
   */
  private sanitizeString(text: string): string {
    let sanitized = text;
    
    for (const [patternName, pattern] of Object.entries(PRIVACY_PATTERNS)) {
      sanitized = sanitized.replace(pattern, `[${patternName.toUpperCase()}_REDACTED]`);
    }
    
    return sanitized;
  }

  /**
   * Validate object for privacy compliance
   * 
   * @param obj - Object to validate
   * @returns Privacy validation result
   */
  private validateObjectPrivacy(obj: any): PrivacyValidationResult {
    const violations: string[] = [];
    const sanitizedData: any = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitiveField(key)) {
        violations.push(`Contains sensitive field: ${key}`);
        sanitizedData[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        const stringResult = this.validatePrivacyCompliance(value);
        violations.push(...stringResult.violations);
        sanitizedData[key] = stringResult.sanitizedData;
      } else if (typeof value === 'object' && value !== null) {
        const objectResult = this.validateObjectPrivacy(value);
        violations.push(...objectResult.violations);
        sanitizedData[key] = objectResult.sanitizedData;
      } else {
        sanitizedData[key] = value;
      }
    }

    return {
      compliant: violations.length === 0,
      violations,
      sanitizedData
    };
  }

  /**
   * Check if a field name indicates sensitive data
   * 
   * @param fieldName - Field name to check
   * @returns True if field is potentially sensitive
   */
  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'email', 'phone', 'phoneNumber', 'ssn', 'socialSecurityNumber',
      'creditCard', 'password', 'token', 'secret', 'key', 'address',
      'firstName', 'lastName', 'fullName', 'name', 'userId', 'id'
    ];

    const lowerFieldName = fieldName.toLowerCase();
    return sensitiveFields.some(sensitive => 
      lowerFieldName.includes(sensitive.toLowerCase())
    );
  }
}

/**
 * Privacy layer factory for creating configured instances
 */
export class PrivacyLayerFactory {
  static create(config?: Partial<PrivacyLayerConfig>): PrivacyLayer {
    return new PrivacyLayer(config);
  }

  static createWithDefaults(): PrivacyLayer {
    return new PrivacyLayer();
  }
}