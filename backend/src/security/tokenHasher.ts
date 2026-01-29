/**
 * Token Hashing Utilities
 * 
 * Implements secure token hashing using SHA-256 with salt for secure storage
 * in the privacy-preserving QR-based calling system.
 * 
 * Requirements: 1.4, 5.2
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { 
  SecureToken, 
  HashedToken, 
  TokenMetadata, 
  UserId 
} from './types';

/**
 * Hashing configuration
 */
export interface HashingConfig {
  readonly algorithm: string;
  readonly saltLength: number;
  readonly iterations?: number; // For future PBKDF2 support
}

/**
 * Default hashing configuration
 */
const DEFAULT_HASHING_CONFIG: HashingConfig = {
  algorithm: 'sha256',
  saltLength: 32, // 256 bits
  iterations: 1 // Simple SHA-256 for now, can be upgraded to PBKDF2
};

/**
 * Token hasher class for secure token storage
 */
export class TokenHasher {
  private readonly config: HashingConfig;

  constructor(config: Partial<HashingConfig> = {}) {
    this.config = { ...DEFAULT_HASHING_CONFIG, ...config };
  }

  /**
   * Hash a secure token for storage
   * 
   * @param token - SecureToken to hash
   * @returns HashedToken with salt and algorithm info
   */
  hashToken(token: SecureToken): HashedToken {
    // Generate cryptographically secure salt
    const salt = randomBytes(this.config.saltLength).toString('hex');
    
    // Create hash with salt
    const hash = this.createHash(token.value, salt);
    
    return {
      hash,
      salt,
      algorithm: this.config.algorithm
    };
  }

  /**
   * Verify a token against its hash
   * 
   * @param token - SecureToken to verify
   * @param hashedToken - HashedToken to verify against
   * @returns boolean indicating if token matches hash
   */
  verifyToken(token: SecureToken, hashedToken: HashedToken): boolean {
    try {
      // Recreate hash with stored salt
      const computedHash = this.createHash(token.value, hashedToken.salt);
      
      // Use timing-safe comparison to prevent timing attacks
      const computedBuffer = Buffer.from(computedHash, 'hex');
      const storedBuffer = Buffer.from(hashedToken.hash, 'hex');
      
      // Ensure buffers are same length for timing safety
      if (computedBuffer.length !== storedBuffer.length) {
        return false;
      }
      
      return timingSafeEqual(computedBuffer, storedBuffer);
    } catch (error) {
      // Log error securely (without exposing token data)
      console.error('Token verification error:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Create token metadata for database storage
   * 
   * @param token - SecureToken to create metadata for
   * @param userId - UserId associated with token
   * @param expirationHours - Optional expiration time in hours
   * @returns TokenMetadata for database storage
   */
  createTokenMetadata(
    token: SecureToken, 
    userId: UserId, 
    expirationHours?: number
  ): TokenMetadata {
    const hashedToken = this.hashToken(token);
    
    let expiresAt: Date | undefined;
    if (expirationHours) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expirationHours);
    }
    
    return {
      hashedToken,
      userId,
      createdAt: token.createdAt,
      expiresAt,
      isRevoked: false
    };
  }

  /**
   * Check if token metadata indicates an expired token
   * 
   * @param metadata - TokenMetadata to check
   * @param currentTime - Current time (for testing)
   * @returns boolean indicating if token is expired
   */
  isTokenExpired(metadata: TokenMetadata, currentTime: Date = new Date()): boolean {
    if (!metadata.expiresAt) {
      return false; // No expiration set
    }
    
    return currentTime > metadata.expiresAt;
  }

  /**
   * Check if token metadata indicates a revoked token
   * 
   * @param metadata - TokenMetadata to check
   * @returns boolean indicating if token is revoked
   */
  isTokenRevoked(metadata: TokenMetadata): boolean {
    return metadata.isRevoked;
  }

  /**
   * Format hashed token for database storage
   * 
   * @param hashedToken - HashedToken to format
   * @returns Formatted string for database storage
   */
  formatHashedToken(hashedToken: HashedToken): string {
    return `${hashedToken.algorithm}:${hashedToken.salt}:${hashedToken.hash}`;
  }

  /**
   * Parse formatted hashed token from database
   * 
   * @param formatted - Formatted string from database
   * @returns HashedToken object
   */
  parseHashedToken(formatted: string): HashedToken {
    const parts = formatted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid formatted hashed token');
    }
    
    return {
      algorithm: parts[0],
      salt: parts[1],
      hash: parts[2]
    };
  }

  /**
   * Create hash with salt
   * 
   * @param tokenValue - Token value to hash
   * @param salt - Salt to use for hashing
   * @returns Hex-encoded hash
   */
  private createHash(tokenValue: string, salt: string): string {
    const data = `${tokenValue}:${salt}`;
    return createHash(this.config.algorithm).update(data).digest('hex');
  }
}

/**
 * Token lookup utilities for database operations
 */
export class TokenLookupUtils {
  private readonly hasher: TokenHasher;

  constructor(hasher: TokenHasher = new TokenHasher()) {
    this.hasher = hasher;
  }

  /**
   * Find matching token metadata from a list
   * 
   * @param token - SecureToken to find
   * @param metadataList - List of TokenMetadata to search
   * @returns Matching TokenMetadata or null
   */
  findMatchingMetadata(
    token: SecureToken, 
    metadataList: TokenMetadata[]
  ): TokenMetadata | null {
    for (const metadata of metadataList) {
      if (this.hasher.verifyToken(token, metadata.hashedToken)) {
        return metadata;
      }
    }
    return null;
  }

  /**
   * Filter valid (non-expired, non-revoked) token metadata
   * 
   * @param metadataList - List of TokenMetadata to filter
   * @param currentTime - Current time (for testing)
   * @returns Filtered list of valid metadata
   */
  filterValidMetadata(
    metadataList: TokenMetadata[], 
    currentTime: Date = new Date()
  ): TokenMetadata[] {
    return metadataList.filter(metadata => 
      !this.hasher.isTokenExpired(metadata, currentTime) &&
      !this.hasher.isTokenRevoked(metadata)
    );
  }

  /**
   * Check if token is valid against metadata
   * 
   * @param token - SecureToken to validate
   * @param metadata - TokenMetadata to validate against
   * @param currentTime - Current time (for testing)
   * @returns boolean indicating validity
   */
  isTokenValidAgainstMetadata(
    token: SecureToken, 
    metadata: TokenMetadata, 
    currentTime: Date = new Date()
  ): boolean {
    // Check if token matches hash
    if (!this.hasher.verifyToken(token, metadata.hashedToken)) {
      return false;
    }

    // Check if token is expired
    if (this.hasher.isTokenExpired(metadata, currentTime)) {
      return false;
    }

    // Check if token is revoked
    if (this.hasher.isTokenRevoked(metadata)) {
      return false;
    }

    return true;
  }
}

/**
 * Default instances for common use
 */
export const defaultTokenHasher = new TokenHasher();
export const defaultTokenLookupUtils = new TokenLookupUtils();