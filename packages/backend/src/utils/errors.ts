/**
 * Comprehensive error handling system for Privacy-Preserving QR-Based Calling System
 * 
 * This module provides privacy-compliant error handling with user-friendly messages
 * and proper error categorization for different failure modes.
 */

import { logger } from './logger';

// Error categories for different types of failures
export enum ErrorCategory {
  TOKEN_ERROR = 'TOKEN_ERROR',
  CALL_SETUP_ERROR = 'CALL_SETUP_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR'
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

// Base error interface
export interface SystemError {
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly code: string;
  readonly message: string;
  readonly userMessage: string;
  readonly timestamp: Date;
  readonly context?: Record<string, unknown>;
  readonly retryable: boolean;
}

// Specific error types
export class PrivacyError extends Error implements SystemError {
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly code: string;
  readonly userMessage: string;
  readonly timestamp: Date;
  readonly context?: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(
    category: ErrorCategory,
    severity: ErrorSeverity,
    code: string,
    message: string,
    userMessage: string,
    retryable: boolean = false,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PrivacyError';
    this.category = category;
    this.severity = severity;
    this.code = code;
    this.userMessage = userMessage;
    this.timestamp = new Date();
    this.context = context;
    this.retryable = retryable;
  }
}

// Error factory for creating specific error types
export class ErrorFactory {
  // Token-related errors
  static invalidTokenFormat(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.TOKEN_ERROR,
      ErrorSeverity.LOW,
      'TOKEN_INVALID_FORMAT',
      'Token format validation failed',
      'Invalid QR code format. Please scan a valid QR code.',
      false
    );
  }

  static expiredToken(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.TOKEN_ERROR,
      ErrorSeverity.LOW,
      'TOKEN_EXPIRED',
      'Token has expired',
      'QR code has expired. Please request a new one.',
      false
    );
  }

  static revokedToken(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.TOKEN_ERROR,
      ErrorSeverity.MEDIUM,
      'TOKEN_REVOKED',
      'Token has been revoked',
      'QR code is no longer valid.',
      false
    );
  }

  static tokenNotFound(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.TOKEN_ERROR,
      ErrorSeverity.LOW,
      'TOKEN_NOT_FOUND',
      'Token not found in system',
      'QR code not recognized. Please verify the code is correct.',
      false
    );
  }

  // Call setup errors
  static userOffline(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.CALL_SETUP_ERROR,
      ErrorSeverity.LOW,
      'USER_OFFLINE',
      'Target user is offline',
      'User is currently unavailable. Please try again later.',
      true
    );
  }

  static networkIssue(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.NETWORK_ERROR,
      ErrorSeverity.MEDIUM,
      'NETWORK_ISSUE',
      'Network connectivity problem',
      'Network connection issue. Please check your connection and try again.',
      true
    );
  }

  static webrtcFailure(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.CALL_SETUP_ERROR,
      ErrorSeverity.HIGH,
      'WEBRTC_FAILURE',
      'WebRTC connection failed',
      'Unable to establish call connection. Please try again.',
      true
    );
  }

  static permissionDenied(permission: string): PrivacyError {
    return new PrivacyError(
      ErrorCategory.PERMISSION_ERROR,
      ErrorSeverity.MEDIUM,
      'PERMISSION_DENIED',
      `${permission} permission denied`,
      `${permission} access is required for calls. Please enable in settings.`,
      false,
      { permission }
    );
  }

  // Authentication errors
  static invalidCredentials(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.AUTHENTICATION_ERROR,
      ErrorSeverity.MEDIUM,
      'INVALID_CREDENTIALS',
      'Authentication failed',
      'Invalid credentials. Please check your login information.',
      false
    );
  }

  static mfaFailure(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.AUTHENTICATION_ERROR,
      ErrorSeverity.MEDIUM,
      'MFA_FAILURE',
      'Multi-factor authentication failed',
      'Authentication code is incorrect. Please try again.',
      true
    );
  }

  static sessionExpired(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.AUTHENTICATION_ERROR,
      ErrorSeverity.LOW,
      'SESSION_EXPIRED',
      'User session has expired',
      'Your session has expired. Please log in again.',
      false
    );
  }

  static rateLimitExceeded(waitTime: number): PrivacyError {
    return new PrivacyError(
      ErrorCategory.RATE_LIMIT_ERROR,
      ErrorSeverity.MEDIUM,
      'RATE_LIMIT_EXCEEDED',
      'Rate limit exceeded',
      `Too many attempts. Please wait ${waitTime} seconds before trying again.`,
      true,
      { waitTime }
    );
  }

  // System errors
  static serviceUnavailable(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.SYSTEM_ERROR,
      ErrorSeverity.HIGH,
      'SERVICE_UNAVAILABLE',
      'Backend service unavailable',
      'Service temporarily unavailable. Please try again in a few moments.',
      true
    );
  }

  static databaseError(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.SYSTEM_ERROR,
      ErrorSeverity.CRITICAL,
      'DATABASE_ERROR',
      'Database operation failed',
      'A system error occurred. Please try again later.',
      true
    );
  }

  static encryptionFailure(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.SYSTEM_ERROR,
      ErrorSeverity.CRITICAL,
      'ENCRYPTION_FAILURE',
      'Encryption operation failed',
      'Security error occurred. Call terminated for your protection.',
      false
    );
  }

  static certificateValidationError(): PrivacyError {
    return new PrivacyError(
      ErrorCategory.SYSTEM_ERROR,
      ErrorSeverity.CRITICAL,
      'CERTIFICATE_VALIDATION_ERROR',
      'Certificate validation failed',
      'Security certificate error. Connection blocked for your protection.',
      false
    );
  }

  // Validation errors
  static invalidInput(field: string): PrivacyError {
    return new PrivacyError(
      ErrorCategory.VALIDATION_ERROR,
      ErrorSeverity.LOW,
      'INVALID_INPUT',
      `Invalid input for field: ${field}`,
      'Invalid input provided. Please check your information and try again.',
      false,
      { field }
    );
  }

  static missingRequiredField(field: string): PrivacyError {
    return new PrivacyError(
      ErrorCategory.VALIDATION_ERROR,
      ErrorSeverity.LOW,
      'MISSING_REQUIRED_FIELD',
      `Missing required field: ${field}`,
      'Required information is missing. Please complete all fields.',
      false,
      { field }
    );
  }
}

// Error handler class for processing and logging errors
export class ErrorHandler {
  static handle(error: Error | PrivacyError, context?: Record<string, unknown>): PrivacyError {
    let privacyError: PrivacyError;

    if (error instanceof PrivacyError) {
      privacyError = error;
    } else {
      // Convert generic errors to privacy errors
      privacyError = this.convertGenericError(error);
    }

    // Log the error with privacy compliance
    this.logError(privacyError, context);

    return privacyError;
  }

  private static convertGenericError(error: Error): PrivacyError {
    // Map common error types to privacy errors
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
      return ErrorFactory.networkIssue();
    }
    
    if (error.message.includes('timeout')) {
      return ErrorFactory.serviceUnavailable();
    }

    if (error.message.includes('permission') || error.message.includes('denied')) {
      return ErrorFactory.permissionDenied('System');
    }

    // Default to generic system error
    return new PrivacyError(
      ErrorCategory.SYSTEM_ERROR,
      ErrorSeverity.MEDIUM,
      'UNKNOWN_ERROR',
      error.message,
      'An unexpected error occurred. Please try again.',
      true
    );
  }

  private static logError(error: PrivacyError, context?: Record<string, unknown>): void {
    const logContext = {
      category: error.category,
      severity: error.severity,
      code: error.code,
      retryable: error.retryable,
      ...context,
      ...error.context
    };

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error(`CRITICAL ERROR: ${error.message}`, logContext);
        break;
      case ErrorSeverity.HIGH:
        logger.error(`HIGH SEVERITY: ${error.message}`, logContext);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn(`MEDIUM SEVERITY: ${error.message}`, logContext);
        break;
      case ErrorSeverity.LOW:
        logger.info(`LOW SEVERITY: ${error.message}`, logContext);
        break;
    }
  }

  // Get user-friendly error response for API
  static getErrorResponse(error: PrivacyError): {
    error: string;
    code: string;
    timestamp: string;
    retryable: boolean;
  } {
    return {
      error: error.userMessage,
      code: error.code,
      timestamp: error.timestamp.toISOString(),
      retryable: error.retryable
    };
  }

  // Check if error should trigger security alert
  static shouldTriggerSecurityAlert(error: PrivacyError): boolean {
    return error.severity === ErrorSeverity.CRITICAL ||
           error.category === ErrorCategory.AUTHENTICATION_ERROR ||
           error.code === 'CERTIFICATE_VALIDATION_ERROR' ||
           error.code === 'ENCRYPTION_FAILURE';
  }
}

// Utility functions for error handling
export function isRetryableError(error: Error | PrivacyError): boolean {
  if (error instanceof PrivacyError) {
    return error.retryable;
  }
  return false;
}

export function getErrorCategory(error: Error | PrivacyError): ErrorCategory {
  if (error instanceof PrivacyError) {
    return error.category;
  }
  return ErrorCategory.SYSTEM_ERROR;
}

export function createErrorFromCode(code: string, context?: Record<string, unknown>): PrivacyError {
  switch (code) {
    case 'TOKEN_INVALID_FORMAT':
      return ErrorFactory.invalidTokenFormat();
    case 'TOKEN_EXPIRED':
      return ErrorFactory.expiredToken();
    case 'TOKEN_REVOKED':
      return ErrorFactory.revokedToken();
    case 'TOKEN_NOT_FOUND':
      return ErrorFactory.tokenNotFound();
    case 'USER_OFFLINE':
      return ErrorFactory.userOffline();
    case 'NETWORK_ISSUE':
      return ErrorFactory.networkIssue();
    case 'WEBRTC_FAILURE':
      return ErrorFactory.webrtcFailure();
    case 'INVALID_CREDENTIALS':
      return ErrorFactory.invalidCredentials();
    case 'MFA_FAILURE':
      return ErrorFactory.mfaFailure();
    case 'SESSION_EXPIRED':
      return ErrorFactory.sessionExpired();
    case 'SERVICE_UNAVAILABLE':
      return ErrorFactory.serviceUnavailable();
    case 'DATABASE_ERROR':
      return ErrorFactory.databaseError();
    case 'ENCRYPTION_FAILURE':
      return ErrorFactory.encryptionFailure();
    case 'CERTIFICATE_VALIDATION_ERROR':
      return ErrorFactory.certificateValidationError();
    default:
      return new PrivacyError(
        ErrorCategory.SYSTEM_ERROR,
        ErrorSeverity.MEDIUM,
        'UNKNOWN_ERROR',
        'Unknown error occurred',
        'An unexpected error occurred. Please try again.',
        true,
        context
      );
  }
}