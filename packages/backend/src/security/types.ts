/**
 * Security Types for Privacy-Preserving QR-Based Calling System
 * 
 * Defines core security types including secure tokens, user identifiers,
 * and anonymous session management types.
 */

// Branded types for type safety
export type UserId = string & { readonly __brand: unique symbol };
export type AnonymousId = string & { readonly __brand: unique symbol };

/**
 * Secure token structure with cryptographic properties
 */
export interface SecureToken {
  readonly value: string;      // 256-bit cryptographically secure token
  readonly version: number;    // Token format version for future compatibility
  readonly checksum: string;   // Integrity verification checksum
  readonly createdAt: Date;    // Token creation timestamp
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  readonly isValid: boolean;
  readonly error?: TokenValidationError;
  readonly token?: SecureToken;
}

/**
 * Token validation error types
 */
export enum TokenValidationError {
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_CHECKSUM = 'INVALID_CHECKSUM',
  UNSUPPORTED_VERSION = 'UNSUPPORTED_VERSION',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  MALFORMED_DATA = 'MALFORMED_DATA'
}

/**
 * Token generation configuration
 */
export interface TokenGenerationConfig {
  readonly entropyBits: number;     // Minimum 256 bits
  readonly version: number;         // Current token format version
  readonly expirationHours?: number; // Optional expiration time
}

/**
 * Hashed token for secure storage
 */
export interface HashedToken {
  readonly hash: string;        // SHA-256 hash of the token
  readonly salt: string;        // Salt used for hashing
  readonly algorithm: string;   // Hashing algorithm used
}

/**
 * Token metadata for database storage
 */
export interface TokenMetadata {
  readonly hashedToken: HashedToken;
  readonly userId: UserId;
  readonly createdAt: Date;
  readonly expiresAt?: Date;
  readonly isRevoked: boolean;
}