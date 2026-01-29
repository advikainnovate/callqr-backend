/**
 * QR Code Generation Service
 * 
 * Implements QR code generation that embeds only secure tokens
 * with token lifecycle management for the privacy-preserving calling system.
 * 
 * Requirements: 1.2, 1.3
 */

import * as QRCode from 'qrcode';
import { SecureToken, UserId } from './types';
import { TokenManager } from './tokenManager';

/**
 * QR code generation configuration
 */
export interface QRCodeConfig {
  readonly errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  readonly type: 'image/png' | 'image/jpeg' | 'svg';
  readonly width: number;
  readonly margin: number;
  readonly color: {
    dark: string;
    light: string;
  };
}

/**
 * Default QR code configuration
 */
const DEFAULT_QR_CONFIG: QRCodeConfig = {
  errorCorrectionLevel: 'M', // Medium error correction for balance
  type: 'image/png',
  width: 256,
  margin: 4,
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  }
};

/**
 * QR code generation result
 */
export interface QRCodeResult {
  readonly qrCodeData: string;    // Base64 encoded QR code image or SVG string
  readonly tokenId: string;       // Reference ID for the token (not the actual token)
  readonly expiresAt: Date;       // Token expiration time
  readonly format: string;        // MIME type of the QR code data
}

/**
 * QR code generation service
 */
export class QRCodeGenerator {
  private readonly tokenManager: TokenManager;
  private readonly config: QRCodeConfig;

  constructor(
    tokenManager: TokenManager,
    config: Partial<QRCodeConfig> = {}
  ) {
    this.tokenManager = tokenManager;
    this.config = { ...DEFAULT_QR_CONFIG, ...config };
  }

  /**
   * Generate a new QR code for a user
   * Invalidates previous tokens and creates a fresh one
   * 
   * @param userId - User ID to generate QR code for
   * @returns Promise resolving to QRCodeResult
   */
  async generateQRCode(userId: UserId): Promise<QRCodeResult> {
    // Generate new secure token (this automatically invalidates old ones)
    const token = await this.tokenManager.generateToken(userId);
    
    // Format token for QR code embedding (contains only the secure token)
    const qrData = this.tokenManager.formatTokenForQR(token);
    
    // Generate QR code image
    const qrCodeData = await this.generateQRCodeImage(qrData);
    
    // Calculate expiration time (7 days from now as per token manager config)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (24 * 7)); // 7 days
    
    // Create a reference ID for the token (not the actual token value)
    const tokenId = this.generateTokenReference(token);
    
    return {
      qrCodeData,
      tokenId,
      expiresAt,
      format: this.config.type
    };
  }

  /**
   * Regenerate QR code for a user (invalidates old token)
   * 
   * @param userId - User ID to regenerate QR code for
   * @returns Promise resolving to QRCodeResult
   */
  async regenerateQRCode(userId: UserId): Promise<QRCodeResult> {
    // Revoke all existing tokens for the user first
    await this.tokenManager.revokeAllUserTokens(userId);
    
    // Generate new QR code
    return await this.generateQRCode(userId);
  }

  /**
   * Get current valid QR codes for a user
   * 
   * @param userId - User ID to get QR codes for
   * @returns Promise resolving to array of QRCodeResult
   */
  async getUserQRCodes(userId: UserId): Promise<QRCodeResult[]> {
    const validTokens = await this.tokenManager.getUserTokens(userId);
    const results: QRCodeResult[] = [];
    
    for (const tokenMetadata of validTokens) {
      // We need to reconstruct the token from metadata
      // Note: In a real implementation, we'd need a way to get the actual token
      // For now, we'll create a placeholder that shows the concept
      const qrData = `pqc:1:${tokenMetadata.hashedToken.hash.substring(0, 64)}:placeholder`;
      const qrCodeData = await this.generateQRCodeImage(qrData);
      
      results.push({
        qrCodeData,
        tokenId: tokenMetadata.hashedToken.hash.substring(0, 16),
        expiresAt: tokenMetadata.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        format: this.config.type
      });
    }
    
    return results;
  }

  /**
   * Validate QR code data format
   * 
   * @param qrData - Raw QR code data to validate
   * @returns Boolean indicating if QR data is valid
   */
  validateQRCodeData(qrData: string): boolean {
    const token = this.tokenManager.extractTokenFromQR(qrData);
    return token !== null;
  }

  /**
   * Extract token from QR code data
   * 
   * @param qrData - Raw QR code data
   * @returns SecureToken if valid, null otherwise
   */
  extractTokenFromQR(qrData: string): SecureToken | null {
    return this.tokenManager.extractTokenFromQR(qrData);
  }

  /**
   * Generate QR code image from data
   * 
   * @param data - Data to encode in QR code
   * @returns Promise resolving to base64 encoded image or SVG string
   */
  private async generateQRCodeImage(data: string): Promise<string> {
    try {
      if (this.config.type === 'svg') {
        const svgOptions = {
          errorCorrectionLevel: this.config.errorCorrectionLevel,
          type: 'svg' as const,
          margin: this.config.margin,
          color: this.config.color,
          width: this.config.width
        };
        return await QRCode.toString(data, svgOptions);
      } else {
        // Generate as data URL for images
        const imageOptions = {
          errorCorrectionLevel: this.config.errorCorrectionLevel,
          type: this.config.type === 'image/jpeg' ? 'image/jpeg' as const : 'image/png' as const,
          quality: this.config.type === 'image/jpeg' ? 0.92 : undefined,
          margin: this.config.margin,
          color: this.config.color,
          width: this.config.width
        };
        return await QRCode.toDataURL(data, imageOptions);
      }
    } catch (error) {
      throw new Error(`Failed to generate QR code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a reference ID for a token (not the actual token)
   * 
   * @param token - SecureToken to generate reference for
   * @returns Reference ID string
   */
  private generateTokenReference(token: SecureToken): string {
    // Create a non-reversible reference ID from token metadata and partial value
    // Use more of the token value to ensure uniqueness
    const referenceData = `${token.version}-${token.createdAt.getTime()}-${token.checksum}-${token.value.substring(0, 16)}`;
    const hash = require('crypto').createHash('sha256').update(referenceData).digest('hex');
    return hash.substring(0, 16);
  }
}

/**
 * QR code generator factory
 */
export class QRCodeGeneratorFactory {
  static create(
    tokenManager: TokenManager,
    config?: Partial<QRCodeConfig>
  ): QRCodeGenerator {
    return new QRCodeGenerator(tokenManager, config);
  }

  static createWithDefaults(tokenManager: TokenManager): QRCodeGenerator {
    return new QRCodeGenerator(tokenManager);
  }
}