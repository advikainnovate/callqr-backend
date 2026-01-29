/**
 * Privacy-compliant logging utility
 * 
 * This logger ensures that no personal information is logged while providing
 * sufficient diagnostic information for debugging and monitoring.
 * 
 * Requirements: 4.5
 */

import { LogSanitizer, defaultLogSanitizer } from './logSanitizer';
import { PrivacyDataHandler, defaultPrivacyDataHandler } from './privacyDataHandler';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

export interface SanitizedLogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
  sanitizationApplied?: boolean;
  privacyCompliant?: boolean;
}

class PrivacyLogger {
  private logLevel: LogLevel;
  private sanitizer: LogSanitizer;
  private privacyHandler: PrivacyDataHandler;
  private enableAdvancedSanitization: boolean;

  constructor(
    logLevel?: LogLevel,
    sanitizer?: LogSanitizer,
    privacyHandler?: PrivacyDataHandler,
    enableAdvancedSanitization: boolean = true
  ) {
    this.logLevel = logLevel ?? this.getLogLevelFromEnv();
    this.sanitizer = sanitizer ?? defaultLogSanitizer;
    this.privacyHandler = privacyHandler ?? defaultPrivacyDataHandler;
    this.enableAdvancedSanitization = enableAdvancedSanitization;
  }

  private getLogLevelFromEnv(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    switch (envLevel) {
      case 'debug': return LogLevel.DEBUG;
      case 'info': return LogLevel.INFO;
      case 'warn': return LogLevel.WARN;
      case 'error': return LogLevel.ERROR;
      default: return LogLevel.INFO;
    }
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private sanitizeContext(context?: Record<string, unknown>): {
    sanitized: Record<string, unknown> | undefined;
    sanitizationApplied: boolean;
    privacyCompliant: boolean;
  } {
    if (!context) {
      return { sanitized: undefined, sanitizationApplied: false, privacyCompliant: true };
    }

    let sanitized: Record<string, unknown> = {};
    let sanitizationApplied = false;
    let privacyCompliant = true;

    // First apply basic sanitization
    for (const [key, value] of Object.entries(context)) {
      if (this.isSensitiveField(key)) {
        if (typeof value === 'string' && value.length > 0) {
          sanitized[key] = this.hashValue(value);
          sanitizationApplied = true;
        } else {
          sanitized[key] = '[REDACTED]';
          sanitizationApplied = true;
        }
      } else {
        sanitized[key] = value;
      }
    }

    // Apply advanced sanitization if enabled
    if (this.enableAdvancedSanitization) {
      // Check for privacy compliance
      const complianceResult = this.privacyHandler.validatePrivacyCompliance(sanitized);
      privacyCompliant = complianceResult.isCompliant;

      // Apply log sanitizer
      const sanitizerResult = this.sanitizer.sanitize(sanitized);
      sanitized = sanitizerResult.sanitizedData;
      
      if (sanitizerResult.sanitizationCount > 0) {
        sanitizationApplied = true;
      }

      // Block call content if detected
      const contentBlock = this.privacyHandler.blockCallContent(sanitized);
      if (contentBlock.blocked) {
        sanitized = { 
          message: 'Call content blocked for privacy compliance',
          reason: contentBlock.reason,
          timestamp: new Date()
        };
        sanitizationApplied = true;
        privacyCompliant = false;
      }
    }

    return { sanitized, sanitizationApplied, privacyCompliant };
  }

  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'token', 'password', 'secret', 'key', 'auth', 'credential',
      'phone', 'email', 'name', 'address', 'userId', 'personalInfo',
      'sessionToken', 'accessToken', 'refreshToken', 'apiKey',
      'emergencyContact', 'vehicleNumber', 'ipAddress', 'userAgent',
      'deviceId', 'fingerprint', 'ssn', 'creditCard', 'payment'
    ];
    
    return sensitiveFields.some(sensitive => 
      fieldName.toLowerCase().includes(sensitive.toLowerCase())
    );
  }

  private hashValue(value: string): string {
    // Simple hash for logging (not cryptographically secure)
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `[HASH:${Math.abs(hash).toString(16)}]`;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    // Sanitize message content
    let sanitizedMessage = message;
    let messageSanitizationApplied = false;

    if (this.enableAdvancedSanitization) {
      const messageResult = this.sanitizer.sanitizeString(message);
      sanitizedMessage = messageResult.sanitized;
      messageSanitizationApplied = messageResult.replacements > 0;
    }

    // Sanitize context
    const contextResult = this.sanitizeContext(context);

    const entry: SanitizedLogEntry = {
      level,
      message: sanitizedMessage,
      timestamp: new Date(),
      context: contextResult.sanitized,
      sanitizationApplied: contextResult.sanitizationApplied || messageSanitizationApplied,
      privacyCompliant: contextResult.privacyCompliant
    };

    const levelName = LogLevel[level];
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    const privacyFlag = entry.privacyCompliant ? '' : ' [PRIVACY_VIOLATION]';
    const sanitizationFlag = entry.sanitizationApplied ? ' [SANITIZED]' : '';
    
    console.log(`[${entry.timestamp.toISOString()}] ${levelName}: ${entry.message}${contextStr}${privacyFlag}${sanitizationFlag}`);

    // Log privacy violations at ERROR level
    if (!entry.privacyCompliant && level !== LogLevel.ERROR) {
      console.log(`[${entry.timestamp.toISOString()}] ERROR: Privacy violation detected in log entry`);
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log with explicit privacy compliance check
   */
  logWithPrivacyCheck(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    // Force privacy compliance validation
    const originalAdvancedSanitization = this.enableAdvancedSanitization;
    this.enableAdvancedSanitization = true;
    
    this.log(level, message, context);
    
    this.enableAdvancedSanitization = originalAdvancedSanitization;
  }

  /**
   * Log session event with privacy compliance
   */
  logSessionEvent(
    level: LogLevel,
    event: string,
    sessionId?: string,
    additionalContext?: Record<string, unknown>
  ): void {
    const context = {
      event,
      sessionId: sessionId ? sessionId.substring(0, 12) + '...' : undefined,
      ...additionalContext
    };

    this.logWithPrivacyCheck(level, `Session event: ${event}`, context);
  }

  /**
   * Log security event with enhanced privacy protection
   */
  logSecurityEvent(
    event: string,
    details: Record<string, unknown>,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM'
  ): void {
    const context = {
      securityEvent: event,
      severity,
      timestamp: new Date(),
      ...details
    };

    const level = severity === 'CRITICAL' || severity === 'HIGH' ? LogLevel.ERROR : LogLevel.WARN;
    this.logWithPrivacyCheck(level, `Security event: ${event}`, context);
  }

  /**
   * Enable or disable advanced sanitization
   */
  setAdvancedSanitization(enabled: boolean): void {
    this.enableAdvancedSanitization = enabled;
  }

  /**
   * Get sanitization statistics
   */
  getSanitizationStats(): any {
    return this.sanitizer.getStatistics();
  }
}

// Export singleton instance
export const logger = new PrivacyLogger();

// Export class for testing
export { PrivacyLogger };