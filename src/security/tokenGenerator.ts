/**
 * Secure Token Generator
 * 
 * Implements cryptographically secure token generation with 256-bit entropy
 * for the privacy-preserving QR-based calling system.
 * 
 * Requirements: 1.1, 1.5, 5.1
 */

import { randomBytes, createHash } from 'crypto';
import { 
  SecureToken, 
  TokenGenerationConfig, 
  TokenValidationResult, 
  TokenValidationError 
} from './types';

/**
 * Default token generation configuration
 */
const DEFAULT_CONFIG: TokenGenerationConfig = {
  entropyBits: 256,
  version: 1,
  expirationHours: 24 * 7 // 7 days default
};

/**
 * Token format constants
 */
const TOKEN_VERSION_1_LENGTH = 64; // 256 bits = 32 bytes = 64 hex chars
const CHECKSUM_LENGTH = 8; // First 8 chars of SHA-256 hash
const TOKEN_PREFIX = 'pqc'; // Privacy QR Calling prefix

/**
 * Secure token generator class
 */
export class TokenGenerator {
  private readonly config: TokenGenerationConfig;

  constructor(config: Partial<TokenGenerationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Validate minimum entropy requirement
    if (this.config.entropyBits < 256) {
      throw new Error('Token entropy must be at least 256 bits for security');
    }
  }

  /**
   * Generate a cryptographically secure token
   * 
   * @returns SecureToken with 256-bit entropy and integrity checksum
   */
  generateToken(): SecureToken {
    const entropyBytes = this.config.entropyBits / 8;
    
    // Generate cryptographically secure random bytes
    const tokenBytes = randomBytes(entropyBytes);
    const tokenValue = tokenBytes.toString('hex');
    
    // Create integrity checksum
    const checksum = this.generateChecksum(tokenValue, this.config.version);
    
    // Create token with metadata
    const token: SecureToken = {
      value: tokenValue,
      version: this.config.version,
      checksum,
      createdAt: new Date()
    };

    return token;
  }

  /**
   * Validate token format and integrity
   * 
   * @param tokenData - Raw token data to validate
   * @returns TokenValidationResult with validation status and errors
   */
  validateToken(tokenData: string): TokenValidationResult {
    try {
      // Parse token data
      const parsed = this.parseTokenData(tokenData);
      if (!parsed) {
        return {
          isValid: false,
          error: TokenValidationError.INVALID_FORMAT
        };
      }

      const { value, version, checksum } = parsed;

      // Validate version support
      if (version !== 1) {
        return {
          isValid: false,
          error: TokenValidationError.UNSUPPORTED_VERSION
        };
      }

      // Validate token length for version 1
      if (value.length !== TOKEN_VERSION_1_LENGTH) {
        return {
          isValid: false,
          error: TokenValidationError.INVALID_FORMAT
        };
      }

      // Validate hex format
      if (!/^[0-9a-f]+$/i.test(value)) {
        return {
          isValid: false,
          error: TokenValidationError.INVALID_FORMAT
        };
      }

      // Validate checksum
      const expectedChecksum = this.generateChecksum(value, version);
      if (checksum !== expectedChecksum) {
        return {
          isValid: false,
          error: TokenValidationError.INVALID_CHECKSUM
        };
      }

      // Create validated token
      const token: SecureToken = {
        value,
        version,
        checksum,
        createdAt: new Date() // Note: actual creation time would come from storage
      };

      return {
        isValid: true,
        token
      };

    } catch (error) {
      return {
        isValid: false,
        error: TokenValidationError.MALFORMED_DATA
      };
    }
  }

  /**
   * Format token for QR code embedding
   * 
   * @param token - SecureToken to format
   * @returns Formatted string for QR code
   */
  formatForQR(token: SecureToken): string {
    return `${TOKEN_PREFIX}:${token.version}:${token.value}:${token.checksum}`;
  }

  /**
   * Extract token from QR code data
   * 
   * @param qrData - Raw QR code data
   * @returns SecureToken if valid, null otherwise
   */
  extractFromQR(qrData: string): SecureToken | null {
    const validation = this.validateToken(qrData);
    return validation.isValid ? validation.token! : null;
  }

  /**
   * Generate integrity checksum for token
   * 
   * @param tokenValue - Token value to checksum
   * @param version - Token version
   * @returns Checksum string
   */
  private generateChecksum(tokenValue: string, version: number): string {
    const data = `${tokenValue}:${version}`;
    const hash = createHash('sha256').update(data).digest('hex');
    return hash.substring(0, CHECKSUM_LENGTH);
  }

  /**
   * Parse token data from formatted string
   * 
   * @param tokenData - Formatted token string
   * @returns Parsed token components or null if invalid
   */
  private parseTokenData(tokenData: string): {
    value: string;
    version: number;
    checksum: string;
  } | null {
    try {
      // Expected format: "pqc:1:tokenvalue:checksum"
      const parts = tokenData.split(':');
      
      if (parts.length !== 4) {
        return null;
      }

      const [prefix, versionStr, value, checksum] = parts;

      if (prefix !== TOKEN_PREFIX) {
        return null;
      }

      const version = parseInt(versionStr, 10);
      if (isNaN(version)) {
        return null;
      }

      return { value, version, checksum };
    } catch {
      return null;
    }
  }
}

/**
 * Default token generator instance
 */
export const defaultTokenGenerator = new TokenGenerator();