/**
 * Token Storage Interface
 * 
 * Defines the interface for secure database storage of token mappings
 * in the privacy-preserving QR-based calling system.
 * 
 * Requirements: 1.4, 5.2
 */

import { 
  SecureToken, 
  TokenMetadata, 
  UserId, 
  HashedToken 
} from './types';

/**
 * Token storage interface for database operations
 */
export interface TokenStorage {
  /**
   * Store a token mapping in the database
   * 
   * @param metadata - TokenMetadata to store
   * @returns Promise resolving to success status
   */
  storeTokenMapping(metadata: TokenMetadata): Promise<void>;

  /**
   * Look up user ID by token hash
   * 
   * @param hashedToken - HashedToken to look up
   * @returns Promise resolving to UserId or null if not found
   */
  lookupUser(hashedToken: HashedToken): Promise<UserId | null>;

  /**
   * Look up token metadata by user ID
   * 
   * @param userId - UserId to look up tokens for
   * @returns Promise resolving to array of TokenMetadata
   */
  lookupTokensByUser(userId: UserId): Promise<TokenMetadata[]>;

  /**
   * Invalidate a token (mark as revoked)
   * 
   * @param hashedToken - HashedToken to invalidate
   * @returns Promise resolving to success status
   */
  invalidateToken(hashedToken: HashedToken): Promise<void>;

  /**
   * Clean up expired tokens
   * 
   * @param currentTime - Current time for expiration check
   * @returns Promise resolving to number of cleaned up tokens
   */
  cleanupExpiredTokens(currentTime?: Date): Promise<number>;

  /**
   * Get all valid tokens for a user
   * 
   * @param userId - UserId to get tokens for
   * @param currentTime - Current time for validation
   * @returns Promise resolving to array of valid TokenMetadata
   */
  getValidTokensForUser(userId: UserId, currentTime?: Date): Promise<TokenMetadata[]>;
}

/**
 * Token storage error types
 */
export enum TokenStorageError {
  TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  DUPLICATE_TOKEN = 'DUPLICATE_TOKEN',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INVALID_METADATA = 'INVALID_METADATA'
}

/**
 * Token storage exception
 */
export class TokenStorageException extends Error {
  constructor(
    public readonly errorType: TokenStorageError,
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TokenStorageException';
  }
}

/**
 * In-memory token storage implementation for testing and development
 */
export class InMemoryTokenStorage implements TokenStorage {
  private readonly tokenMappings = new Map<string, TokenMetadata>();
  private readonly userTokens = new Map<string, Set<string>>();

  async storeTokenMapping(metadata: TokenMetadata): Promise<void> {
    const tokenKey = this.getTokenKey(metadata.hashedToken);
    
    // Check for duplicate token
    if (this.tokenMappings.has(tokenKey)) {
      throw new TokenStorageException(
        TokenStorageError.DUPLICATE_TOKEN,
        'Token already exists in storage'
      );
    }

    // Store token mapping
    this.tokenMappings.set(tokenKey, metadata);

    // Update user token index
    const userId = metadata.userId as string;
    if (!this.userTokens.has(userId)) {
      this.userTokens.set(userId, new Set());
    }
    this.userTokens.get(userId)!.add(tokenKey);
  }

  async lookupUser(hashedToken: HashedToken): Promise<UserId | null> {
    const tokenKey = this.getTokenKey(hashedToken);
    const metadata = this.tokenMappings.get(tokenKey);
    return metadata ? metadata.userId : null;
  }

  async lookupTokensByUser(userId: UserId): Promise<TokenMetadata[]> {
    const userIdStr = userId as string;
    const tokenKeys = this.userTokens.get(userIdStr);
    
    if (!tokenKeys) {
      return [];
    }

    const tokens: TokenMetadata[] = [];
    for (const tokenKey of tokenKeys) {
      const metadata = this.tokenMappings.get(tokenKey);
      if (metadata) {
        tokens.push(metadata);
      }
    }

    return tokens;
  }

  async invalidateToken(hashedToken: HashedToken): Promise<void> {
    const tokenKey = this.getTokenKey(hashedToken);
    const metadata = this.tokenMappings.get(tokenKey);
    
    if (!metadata) {
      throw new TokenStorageException(
        TokenStorageError.TOKEN_NOT_FOUND,
        'Token not found for invalidation'
      );
    }

    // Mark as revoked
    const updatedMetadata: TokenMetadata = {
      ...metadata,
      isRevoked: true
    };

    this.tokenMappings.set(tokenKey, updatedMetadata);
  }

  async cleanupExpiredTokens(currentTime: Date = new Date()): Promise<number> {
    let cleanedCount = 0;
    const expiredTokens: string[] = [];

    // Find expired tokens
    for (const [tokenKey, metadata] of this.tokenMappings) {
      if (metadata.expiresAt && currentTime > metadata.expiresAt) {
        expiredTokens.push(tokenKey);
      }
    }

    // Remove expired tokens
    for (const tokenKey of expiredTokens) {
      const metadata = this.tokenMappings.get(tokenKey);
      if (metadata) {
        // Remove from token mappings
        this.tokenMappings.delete(tokenKey);
        
        // Remove from user token index
        const userId = metadata.userId as string;
        const userTokens = this.userTokens.get(userId);
        if (userTokens) {
          userTokens.delete(tokenKey);
          if (userTokens.size === 0) {
            this.userTokens.delete(userId);
          }
        }
        
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  async getValidTokensForUser(
    userId: UserId, 
    currentTime: Date = new Date()
  ): Promise<TokenMetadata[]> {
    const allTokens = await this.lookupTokensByUser(userId);
    
    return allTokens.filter(metadata => 
      !metadata.isRevoked && 
      (!metadata.expiresAt || currentTime <= metadata.expiresAt)
    );
  }

  /**
   * Get storage statistics (for testing/debugging)
   */
  getStats(): { totalTokens: number; totalUsers: number } {
    return {
      totalTokens: this.tokenMappings.size,
      totalUsers: this.userTokens.size
    };
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.tokenMappings.clear();
    this.userTokens.clear();
  }

  /**
   * Generate consistent key for hashed token
   */
  private getTokenKey(hashedToken: HashedToken): string {
    return `${hashedToken.algorithm}:${hashedToken.hash}:${hashedToken.salt}`;
  }
}

/**
 * Default in-memory storage instance for development
 */
export const defaultTokenStorage = new InMemoryTokenStorage();