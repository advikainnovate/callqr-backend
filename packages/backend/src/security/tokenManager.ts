/**
 * Token Manager
 * 
 * High-level token management service that combines generation, hashing,
 * validation, and storage for the privacy-preserving QR-based calling system.
 * 
 * Requirements: 1.1, 1.4, 1.5, 5.1, 5.2
 */

import { 
  SecureToken, 
  TokenMetadata, 
  UserId, 
  TokenValidationResult 
} from './types';
import { TokenGenerator } from './tokenGenerator';
import { TokenValidator } from './tokenValidator';
import { TokenHasher } from './tokenHasher';
import { TokenStorage, TokenStorageException, TokenStorageError, InMemoryTokenStorage } from './tokenStorage';

/**
 * Token manager configuration
 */
export interface TokenManagerConfig {
  readonly defaultExpirationHours: number;
  readonly maxTokensPerUser: number;
  readonly cleanupIntervalHours: number;
}

/**
 * Default token manager configuration
 */
const DEFAULT_CONFIG: TokenManagerConfig = {
  defaultExpirationHours: 24 * 7, // 7 days
  maxTokensPerUser: 5, // Limit active tokens per user
  cleanupIntervalHours: 24 // Daily cleanup
};

/**
 * Token manager service
 */
export class TokenManager {
  private readonly config: TokenManagerConfig;
  private readonly generator: TokenGenerator;
  private readonly validator: TokenValidator;
  private readonly hasher: TokenHasher;
  private readonly storage: TokenStorage;

  constructor(
    storage: TokenStorage,
    config: Partial<TokenManagerConfig> = {},
    generator: TokenGenerator = new TokenGenerator(),
    validator: TokenValidator = new TokenValidator(),
    hasher: TokenHasher = new TokenHasher()
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storage = storage;
    this.generator = generator;
    this.validator = validator;
    this.hasher = hasher;
  }

  /**
   * Generate a new token for a user
   * 
   * @param userId - UserId to generate token for
   * @returns Promise resolving to SecureToken
   */
  async generateToken(userId: UserId): Promise<SecureToken> {
    // Clean up old tokens for user first
    await this.cleanupUserTokens(userId);

    // Check token limit
    const existingTokens = await this.storage.getValidTokensForUser(userId);
    if (existingTokens.length >= this.config.maxTokensPerUser) {
      // Revoke oldest token to make room
      const oldestToken = existingTokens.sort((a, b) => 
        a.createdAt.getTime() - b.createdAt.getTime()
      )[0];
      await this.storage.invalidateToken(oldestToken.hashedToken);
    }

    // Generate new token
    const token = this.generator.generateToken();

    // Create metadata and store
    const metadata = this.hasher.createTokenMetadata(
      token, 
      userId, 
      this.config.defaultExpirationHours
    );

    await this.storage.storeTokenMapping(metadata);

    return token;
  }

  /**
   * Validate a token from QR code data
   * 
   * @param tokenData - Raw token data from QR code
   * @returns Promise resolving to TokenValidationResult
   */
  async validateToken(tokenData: string): Promise<TokenValidationResult> {
    // First validate format
    const formatResult = this.validator.validateComplete(tokenData);
    if (!formatResult.isValid || !formatResult.token) {
      return formatResult;
    }

    const token = formatResult.token;

    // Check if token exists in storage and is valid
    try {
      const userId = await this.resolveTokenToUser(token);
      
      if (!userId) {
        return {
          isValid: false,
          error: formatResult.error
        };
      }

      return {
        isValid: true,
        token
      };
    } catch (error) {
      return {
        isValid: false,
        error: formatResult.error
      };
    }
  }

  /**
   * Resolve token to user ID
   * 
   * @param token - SecureToken to resolve
   * @returns Promise resolving to UserId or null
   */
  async resolveTokenToUser(token: SecureToken): Promise<UserId | null> {
    try {
      // We need to find the token by comparing hashes
      // This is a simplified approach - in production, we'd use proper database indexing
      
      // For the in-memory storage, we need to iterate through stored tokens
      // and verify each one against our token
      const allUserIds = await this.getAllUserIds();
      
      for (const userId of allUserIds) {
        const userTokens = await this.storage.lookupTokensByUser(userId);
        
        for (const metadata of userTokens) {
          if (this.hasher.verifyToken(token, metadata.hashedToken)) {
            // Check if token is still valid (not expired or revoked)
            if (!metadata.isRevoked && 
                (!metadata.expiresAt || new Date() <= metadata.expiresAt)) {
              return userId;
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error resolving token to user:', error);
      return null;
    }
  }

  /**
   * Revoke a specific token
   * 
   * @param token - SecureToken to revoke
   * @returns Promise resolving to success status
   */
  async revokeToken(token: SecureToken): Promise<boolean> {
    try {
      // Find the token metadata first
      const allUserIds = await this.getAllUserIds();
      
      for (const userId of allUserIds) {
        const userTokens = await this.storage.lookupTokensByUser(userId);
        
        for (const metadata of userTokens) {
          if (this.hasher.verifyToken(token, metadata.hashedToken)) {
            await this.storage.invalidateToken(metadata.hashedToken);
            return true;
          }
        }
      }
      
      return false; // Token not found
    } catch (error) {
      if (error instanceof TokenStorageException && 
          error.errorType === TokenStorageError.TOKEN_NOT_FOUND) {
        return false; // Token not found
      }
      throw error; // Re-throw other errors
    }
  }

  /**
   * Revoke all tokens for a user
   * 
   * @param userId - UserId to revoke tokens for
   * @returns Promise resolving to number of revoked tokens
   */
  async revokeAllUserTokens(userId: UserId): Promise<number> {
    const userTokens = await this.storage.lookupTokensByUser(userId);
    let revokedCount = 0;

    for (const metadata of userTokens) {
      if (!metadata.isRevoked) {
        try {
          await this.storage.invalidateToken(metadata.hashedToken);
          revokedCount++;
        } catch (error) {
          console.error('Error revoking token:', error);
        }
      }
    }

    return revokedCount;
  }

  /**
   * Get valid tokens for a user
   * 
   * @param userId - UserId to get tokens for
   * @returns Promise resolving to array of valid TokenMetadata
   */
  async getUserTokens(userId: UserId): Promise<TokenMetadata[]> {
    return await this.storage.getValidTokensForUser(userId);
  }

  /**
   * Clean up expired tokens system-wide
   * 
   * @returns Promise resolving to number of cleaned tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    return await this.storage.cleanupExpiredTokens();
  }

  /**
   * Format token for QR code display
   * 
   * @param token - SecureToken to format
   * @returns Formatted string for QR code
   */
  formatTokenForQR(token: SecureToken): string {
    return this.generator.formatForQR(token);
  }

  /**
   * Extract token from QR code data
   * 
   * @param qrData - Raw QR code data
   * @returns SecureToken or null if invalid
   */
  extractTokenFromQR(qrData: string): SecureToken | null {
    return this.generator.extractFromQR(qrData);
  }

  /**
   * Clean up old tokens for a specific user
   * 
   * @param userId - UserId to clean up tokens for
   */
  private async cleanupUserTokens(userId: UserId): Promise<void> {
    const userTokens = await this.storage.lookupTokensByUser(userId);
    const currentTime = new Date();

    for (const metadata of userTokens) {
      // Remove expired tokens
      if (this.hasher.isTokenExpired(metadata, currentTime)) {
        try {
          await this.storage.invalidateToken(metadata.hashedToken);
        } catch (error) {
          console.error('Error cleaning up expired token:', error);
        }
      }
    }
  }

  /**
   * Get all user IDs from storage (helper method for token resolution)
   * This is a simplified approach for the in-memory storage
   */
  private async getAllUserIds(): Promise<UserId[]> {
    // This is a workaround for the in-memory storage
    // In a real database implementation, this would be a proper query
    if (this.storage instanceof InMemoryTokenStorage) {
      const stats = (this.storage as any).userTokens as Map<string, Set<string>>;
      return Array.from(stats.keys()) as UserId[];
    }
    
    // For other storage implementations, we'd need a proper method
    return [];
  }

  /**
   * Verify token exists in storage (simplified implementation)
   * 
   * @param token - SecureToken to verify
   * @returns Promise resolving to boolean
   */
  private async verifyTokenInStorage(token: SecureToken): Promise<boolean> {
    try {
      const userId = await this.resolveTokenToUser(token);
      return userId !== null;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Token manager factory for creating configured instances
 */
export class TokenManagerFactory {
  static create(
    storage: TokenStorage,
    config?: Partial<TokenManagerConfig>
  ): TokenManager {
    return new TokenManager(storage, config);
  }

  static createWithDefaults(storage: TokenStorage): TokenManager {
    return new TokenManager(storage);
  }
}