/**
 * Token Mapper Service
 * 
 * Provides secure token resolution to user identities while maintaining
 * privacy protection. Maps secure tokens to users without exposing
 * personal information during the resolution process.
 * 
 * Requirements: 3.1, 3.2
 */

import { SecureToken, UserId, AnonymousId } from '../security/types';
import { TokenManager } from '../security/tokenManager';
import { PrivacyLayer } from './privacyLayer';
import { TokenResolutionResult, TokenResolutionError } from './types';

/**
 * Token mapper configuration
 */
export interface TokenMapperConfig {
  readonly enableLogging: boolean;
  readonly maxResolutionAttempts: number;
  readonly resolutionTimeoutMs: number;
}

/**
 * Default token mapper configuration
 */
const DEFAULT_CONFIG: TokenMapperConfig = {
  enableLogging: false, // Disabled by default for privacy
  maxResolutionAttempts: 3,
  resolutionTimeoutMs: 5000
};

/**
 * Token mapper service for secure user lookup
 */
export class TokenMapper {
  private readonly config: TokenMapperConfig;
  private readonly tokenManager: TokenManager;
  private readonly privacyLayer: PrivacyLayer;

  constructor(
    tokenManager: TokenManager,
    privacyLayer: PrivacyLayer,
    config: Partial<TokenMapperConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokenManager = tokenManager;
    this.privacyLayer = privacyLayer;
  }

  /**
   * Resolve a secure token to user identity with privacy protection
   * 
   * @param token - SecureToken to resolve
   * @returns Promise resolving to TokenResolutionResult
   */
  async resolveTokenToUser(token: SecureToken): Promise<TokenResolutionResult> {
    try {
      // Validate token format first
      const validationResult = await this.tokenManager.validateToken(
        this.tokenManager.formatTokenForQR(token)
      );

      if (!validationResult.isValid) {
        return {
          success: false,
          error: this.mapValidationErrorToResolutionError(validationResult.error)
        };
      }

      // Resolve token to user ID
      const userId = await this.tokenManager.resolveTokenToUser(token);

      if (!userId) {
        return {
          success: false,
          error: TokenResolutionError.TOKEN_NOT_FOUND
        };
      }

      // Generate anonymous ID for the user in this context
      const anonymousId = this.privacyLayer.anonymizeUserForSession(userId);

      // Log resolution (without personal data) if enabled
      if (this.config.enableLogging) {
        this.logTokenResolution(anonymousId);
      }

      return {
        success: true,
        userId,
        anonymousId
      };

    } catch (error) {
      console.error('Token resolution failed:', this.sanitizeError(error));
      return {
        success: false,
        error: TokenResolutionError.RESOLUTION_FAILED
      };
    }
  }

  /**
   * Resolve token with timeout protection
   * 
   * @param token - SecureToken to resolve
   * @returns Promise resolving to TokenResolutionResult with timeout
   */
  async resolveTokenWithTimeout(token: SecureToken): Promise<TokenResolutionResult> {
    return Promise.race([
      this.resolveTokenToUser(token),
      this.createTimeoutPromise()
    ]);
  }

  /**
   * Batch resolve multiple tokens (for system operations)
   * 
   * @param tokens - Array of SecureTokens to resolve
   * @returns Promise resolving to array of TokenResolutionResults
   */
  async batchResolveTokens(tokens: SecureToken[]): Promise<TokenResolutionResult[]> {
    const results: TokenResolutionResult[] = [];

    for (const token of tokens) {
      try {
        const result = await this.resolveTokenWithTimeout(token);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: TokenResolutionError.RESOLUTION_FAILED
        });
      }
    }

    return results;
  }

  /**
   * Verify token exists without full resolution (lightweight check)
   * 
   * @param token - SecureToken to verify
   * @returns Promise resolving to boolean
   */
  async verifyTokenExists(token: SecureToken): Promise<boolean> {
    try {
      const validationResult = await this.tokenManager.validateToken(
        this.tokenManager.formatTokenForQR(token)
      );
      return validationResult.isValid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get anonymous ID for a user without token resolution
   * (for cases where we already have the user ID)
   * 
   * @param userId - UserId to anonymize
   * @returns AnonymousId for the user
   */
  getAnonymousIdForUser(userId: UserId): AnonymousId {
    return this.privacyLayer.anonymizeUserForSession(userId);
  }

  /**
   * Map validation error to resolution error
   * 
   * @param validationError - Validation error from token manager
   * @returns Corresponding TokenResolutionError
   */
  private mapValidationErrorToResolutionError(
    validationError?: any
  ): TokenResolutionError {
    // Map specific validation errors to resolution errors
    switch (validationError) {
      case 'EXPIRED_TOKEN':
        return TokenResolutionError.TOKEN_EXPIRED;
      case 'INVALID_FORMAT':
      case 'INVALID_CHECKSUM':
      case 'MALFORMED_DATA':
        return TokenResolutionError.TOKEN_NOT_FOUND;
      default:
        return TokenResolutionError.RESOLUTION_FAILED;
    }
  }

  /**
   * Create timeout promise for resolution operations
   * 
   * @returns Promise that rejects after timeout
   */
  private createTimeoutPromise(): Promise<TokenResolutionResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject({
          success: false,
          error: TokenResolutionError.RESOLUTION_FAILED
        });
      }, this.config.resolutionTimeoutMs);
    });
  }

  /**
   * Log token resolution (privacy-compliant)
   * 
   * @param anonymousId - Anonymous ID for logging
   */
  private logTokenResolution(anonymousId: AnonymousId): void {
    // Only log anonymous information
    console.log(`Token resolved for anonymous user: ${anonymousId.substring(0, 8)}...`);
  }

  /**
   * Sanitize error for logging (remove sensitive information)
   * 
   * @param error - Error to sanitize
   * @returns Sanitized error information
   */
  private sanitizeError(error: any): any {
    if (error instanceof Error) {
      return {
        message: error.message,
        type: error.constructor.name,
        // Exclude stack trace and other potentially sensitive info
      };
    }
    return 'Unknown error occurred';
  }
}

/**
 * Token mapper factory for creating configured instances
 */
export class TokenMapperFactory {
  static create(
    tokenManager: TokenManager,
    privacyLayer: PrivacyLayer,
    config?: Partial<TokenMapperConfig>
  ): TokenMapper {
    return new TokenMapper(tokenManager, privacyLayer, config);
  }

  static createWithDefaults(
    tokenManager: TokenManager,
    privacyLayer: PrivacyLayer
  ): TokenMapper {
    return new TokenMapper(tokenManager, privacyLayer);
  }
}