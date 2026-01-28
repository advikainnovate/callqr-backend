/**
 * Token Validation Utilities
 * 
 * Provides comprehensive token validation and format checking utilities
 * for the privacy-preserving QR-based calling system.
 * 
 * Requirements: 1.1, 1.5, 5.1
 */

import { 
  SecureToken, 
  TokenValidationResult, 
  TokenValidationError 
} from './types';
import { TokenGenerator } from './tokenGenerator';

/**
 * Token format validation rules
 */
export interface TokenFormatRules {
  readonly minEntropyBits: number;
  readonly maxAge: number; // in milliseconds
  readonly supportedVersions: number[];
  readonly requireChecksum: boolean;
}

/**
 * Default validation rules
 */
const DEFAULT_RULES: TokenFormatRules = {
  minEntropyBits: 256,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  supportedVersions: [1],
  requireChecksum: true
};

/**
 * Token validator class with configurable rules
 */
export class TokenValidator {
  private readonly rules: TokenFormatRules;
  private readonly generator: TokenGenerator;

  constructor(
    rules: Partial<TokenFormatRules> = {},
    generator: TokenGenerator = new TokenGenerator()
  ) {
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.generator = generator;
  }

  /**
   * Validate token format and structure
   * 
   * @param tokenData - Raw token data to validate
   * @returns TokenValidationResult with detailed validation info
   */
  validateFormat(tokenData: string): TokenValidationResult {
    // Use generator's validation for format checking
    return this.generator.validateToken(tokenData);
  }

  /**
   * Validate token age and expiration
   * 
   * @param token - SecureToken to validate
   * @param currentTime - Current timestamp (for testing)
   * @returns boolean indicating if token is within age limits
   */
  validateAge(token: SecureToken, currentTime: Date = new Date()): boolean {
    const tokenAge = currentTime.getTime() - token.createdAt.getTime();
    return tokenAge <= this.rules.maxAge;
  }

  /**
   * Validate token entropy requirements
   * 
   * @param token - SecureToken to validate
   * @returns boolean indicating if token meets entropy requirements
   */
  validateEntropy(token: SecureToken): boolean {
    // For version 1 tokens, check hex string length
    if (token.version === 1) {
      const expectedLength = this.rules.minEntropyBits / 4; // 4 bits per hex char
      return token.value.length >= expectedLength;
    }
    
    return false; // Unsupported version
  }

  /**
   * Validate token version support
   * 
   * @param token - SecureToken to validate
   * @returns boolean indicating if version is supported
   */
  validateVersion(token: SecureToken): boolean {
    return this.rules.supportedVersions.includes(token.version);
  }

  /**
   * Comprehensive token validation
   * 
   * @param tokenData - Raw token data
   * @param currentTime - Current timestamp (for testing)
   * @returns TokenValidationResult with complete validation
   */
  validateComplete(
    tokenData: string, 
    currentTime: Date = new Date()
  ): TokenValidationResult {
    // First validate format
    const formatResult = this.validateFormat(tokenData);
    if (!formatResult.isValid || !formatResult.token) {
      return formatResult;
    }

    const token = formatResult.token;

    // Validate version support
    if (!this.validateVersion(token)) {
      return {
        isValid: false,
        error: TokenValidationError.UNSUPPORTED_VERSION
      };
    }

    // Validate entropy requirements
    if (!this.validateEntropy(token)) {
      return {
        isValid: false,
        error: TokenValidationError.INVALID_FORMAT
      };
    }

    // Validate age (if token has creation time)
    if (!this.validateAge(token, currentTime)) {
      return {
        isValid: false,
        error: TokenValidationError.EXPIRED_TOKEN
      };
    }

    return {
      isValid: true,
      token
    };
  }

  /**
   * Check if token format is potentially valid without full validation
   * 
   * @param tokenData - Raw token data
   * @returns boolean for quick format check
   */
  isValidFormat(tokenData: string): boolean {
    const result = this.validateFormat(tokenData);
    return result.isValid;
  }

  /**
   * Extract validation error message for user display
   * 
   * @param error - TokenValidationError
   * @returns User-friendly error message
   */
  getErrorMessage(error: TokenValidationError): string {
    switch (error) {
      case TokenValidationError.INVALID_FORMAT:
        return 'Invalid QR code format';
      case TokenValidationError.INVALID_CHECKSUM:
        return 'QR code integrity check failed';
      case TokenValidationError.UNSUPPORTED_VERSION:
        return 'QR code version not supported';
      case TokenValidationError.EXPIRED_TOKEN:
        return 'QR code has expired, please request a new one';
      case TokenValidationError.MALFORMED_DATA:
        return 'QR code data is corrupted';
      default:
        return 'QR code is not valid';
    }
  }
}

/**
 * Default token validator instance
 */
export const defaultTokenValidator = new TokenValidator();

/**
 * Utility functions for common validation tasks
 */
export const TokenValidationUtils = {
  /**
   * Quick validation check for API endpoints
   */
  isValid: (tokenData: string): boolean => {
    return defaultTokenValidator.isValidFormat(tokenData);
  },

  /**
   * Get user-friendly error message
   */
  getErrorMessage: (error: TokenValidationError): string => {
    return defaultTokenValidator.getErrorMessage(error);
  },

  /**
   * Validate and extract token in one call
   */
  validateAndExtract: (tokenData: string): SecureToken | null => {
    const result = defaultTokenValidator.validateComplete(tokenData);
    return result.isValid ? result.token! : null;
  }
};