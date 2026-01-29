/**
 * Multi-Factor Authentication Manager
 * 
 * Implements TOTP-based multi-factor authentication for enhanced security.
 */

import * as crypto from 'crypto';
import { MFASetupResponse, MFAVerificationRequest } from './types';

/**
 * TOTP configuration
 */
export interface TOTPConfig {
  readonly window: number;      // Time window in seconds (default: 30)
  readonly digits: number;      // Number of digits in code (default: 6)
  readonly algorithm: string;   // Hash algorithm (default: 'sha1')
  readonly issuer: string;      // Service name for QR code
}

/**
 * Default TOTP configuration
 */
export const DEFAULT_TOTP_CONFIG: TOTPConfig = {
  window: 30,
  digits: 6,
  algorithm: 'sha1',
  issuer: 'Privacy QR Calling'
};

/**
 * MFA Manager class for handling multi-factor authentication
 */
export class MFAManager {
  private readonly config: TOTPConfig;

  constructor(config: TOTPConfig = DEFAULT_TOTP_CONFIG) {
    this.config = config;
  }

  /**
   * Generates a new MFA secret for a user
   */
  generateSecret(): string {
    // Generate 32-byte random secret (base32 encoded)
    const buffer = crypto.randomBytes(32);
    return this.base32Encode(buffer);
  }

  /**
   * Sets up MFA for a user
   */
  setupMFA(userEmail: string): MFASetupResponse {
    const secret = this.generateSecret();
    const qrCodeUrl = this.generateQRCodeUrl(userEmail, secret);
    const backupCodes = this.generateBackupCodes();

    return {
      secret,
      qrCodeUrl,
      backupCodes
    };
  }

  /**
   * Verifies a TOTP code
   */
  verifyTOTP(secret: string, code: string, timeWindow?: number): boolean {
    const window = timeWindow || this.config.window;
    const currentTime = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(currentTime / window);

    // Check current time step and adjacent ones for clock drift tolerance
    for (let i = -1; i <= 1; i++) {
      const testTimeStep = timeStep + i;
      const expectedCode = this.generateTOTP(secret, testTimeStep);
      
      if (this.secureCompare(code, expectedCode)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Verifies a backup code
   */
  verifyBackupCode(userBackupCodes: string[], providedCode: string): boolean {
    const hashedProvidedCode = this.hashBackupCode(providedCode);
    return userBackupCodes.some(storedCode => 
      this.secureCompare(storedCode, hashedProvidedCode)
    );
  }

  /**
   * Generates TOTP code for a given time step
   */
  private generateTOTP(secret: string, timeStep: number): string {
    const secretBuffer = this.base32Decode(secret);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigUInt64BE(BigInt(timeStep), 0);

    // Generate HMAC
    const hmac = crypto.createHmac(this.config.algorithm, secretBuffer);
    hmac.update(timeBuffer);
    const hash = hmac.digest();

    // Dynamic truncation
    const offset = hash[hash.length - 1] & 0x0f;
    const code = (
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)
    ) % Math.pow(10, this.config.digits);

    return code.toString().padStart(this.config.digits, '0');
  }

  /**
   * Generates QR code URL for authenticator apps
   */
  private generateQRCodeUrl(userEmail: string, secret: string): string {
    const params = new URLSearchParams({
      secret,
      issuer: this.config.issuer,
      algorithm: this.config.algorithm.toUpperCase(),
      digits: this.config.digits.toString(),
      period: this.config.window.toString()
    });

    return `otpauth://totp/${encodeURIComponent(this.config.issuer)}:${encodeURIComponent(userEmail)}?${params.toString()}`;
  }

  /**
   * Generates backup codes for account recovery
   */
  private generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(this.hashBackupCode(code));
    }

    return codes;
  }

  /**
   * Hashes backup codes for secure storage
   */
  private hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Base32 encoding for TOTP secrets
   */
  private base32Encode(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    let bits = 0;
    let value = 0;

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;

      while (bits >= 5) {
        result += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      result += alphabet[(value << (5 - bits)) & 31];
    }

    return result;
  }

  /**
   * Base32 decoding for TOTP secrets
   */
  private base32Decode(encoded: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleanInput = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
    
    let bits = 0;
    let value = 0;
    const result: number[] = [];

    for (let i = 0; i < cleanInput.length; i++) {
      const index = alphabet.indexOf(cleanInput[i]);
      if (index === -1) continue;

      value = (value << 5) | index;
      bits += 5;

      if (bits >= 8) {
        result.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }

    return Buffer.from(result);
  }

  /**
   * Secure string comparison to prevent timing attacks
   */
  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }
}