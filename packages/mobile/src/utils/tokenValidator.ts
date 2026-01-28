/**
 * Mobile Token Validator
 * 
 * Validates secure tokens extracted from QR codes on the mobile side.
 * Performs format validation and integrity checks before sending to backend.
 * 
 * Requirements: 2.2, 2.3
 */

import { SecureToken, TokenValidationResult, QRScanError } from '../types';

/**
 * Token format constants (matching backend)
 */
const TOKEN_VERSION_1_LENGTH = 64; // 256 bits = 32 bytes = 64 hex chars
const CHECKSUM_LENGTH = 8; // First 8 chars of SHA-256 hash
const TOKEN_PREFIX = 'pqc'; // Privacy QR Calling prefix

/**
 * Mobile token validator class
 */
export class MobileTokenValidator {
  /**
   * Validate token format and integrity
   * 
   * @param tokenData - Raw token data from QR code
   * @returns TokenValidationResult with validation status and errors
   */
  validateToken(tokenData: string): TokenValidationResult {
    try {
      // Parse token data
      const parsed = this.parseTokenData(tokenData);
      if (!parsed) {
        return {
          isValid: false,
          error: QRScanError.INVALID_FORMAT
        };
      }

      const { value, version, checksum } = parsed;

      // Validate version support
      if (version !== 1) {
        return {
          isValid: false,
          error: QRScanError.UNSUPPORTED_VERSION
        };
      }

      // Validate token length for version 1
      if (value.length !== TOKEN_VERSION_1_LENGTH) {
        return {
          isValid: false,
          error: QRScanError.INVALID_FORMAT
        };
      }

      // Validate hex format
      if (!/^[0-9a-f]+$/i.test(value)) {
        return {
          isValid: false,
          error: QRScanError.INVALID_FORMAT
        };
      }

      // Validate checksum format (8 hex characters)
      if (!/^[0-9a-f]{8}$/i.test(checksum)) {
        return {
          isValid: false,
          error: QRScanError.INVALID_CHECKSUM
        };
      }

      // Note: In a production app, we would validate the actual checksum
      // against the token value using the same algorithm as the backend.
      // For now, we just validate the format.

      // Create validated token
      const token: SecureToken = {
        value,
        version,
        checksum,
        createdAt: new Date() // Note: actual creation time would come from backend
      };

      return {
        isValid: true,
        token
      };

    } catch (error) {
      return {
        isValid: false,
        error: QRScanError.MALFORMED_DATA
      };
    }
  }

  /**
   * Extract token from QR code data
   * 
   * @param qrData - Raw QR code data
   * @returns SecureToken if valid, null otherwise
   */
  extractTokenFromQR(qrData: string): SecureToken | null {
    const validation = this.validateToken(qrData);
    return validation.isValid ? validation.token! : null;
  }

  /**
   * Check if QR data has the correct format prefix
   * 
   * @param qrData - Raw QR code data
   * @returns Boolean indicating if format is recognized
   */
  isValidQRFormat(qrData: string): boolean {
    return qrData.startsWith(`${TOKEN_PREFIX}:`);
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
 * Default mobile token validator instance
 */
export const defaultMobileTokenValidator = new MobileTokenValidator();