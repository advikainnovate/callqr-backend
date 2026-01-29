/**
 * Encryption Manager
 * Handles DTLS/SRTP encryption for WebRTC media streams and secure signaling
 */

import { createHash, randomBytes, createCipher, createDecipher } from 'crypto';
import { AnonymousSessionId } from './types';
import { logger } from '../utils/logger';

export interface DTLSConfiguration {
  readonly fingerprint: string;
  readonly algorithm: string;
  readonly setup: 'active' | 'passive' | 'actpass';
}

export interface SRTPConfiguration {
  readonly cryptoSuite: string;
  readonly keyParams: string;
  readonly sessionParams?: string;
}

export interface EncryptionKeys {
  readonly masterKey: Buffer;
  readonly masterSalt: Buffer;
  readonly keyDerivationRate: number;
}

export interface MediaEncryptionInfo {
  readonly dtls: DTLSConfiguration;
  readonly srtp: SRTPConfiguration;
  readonly keys: EncryptionKeys;
}

export class EncryptionManager {
  private readonly sessionKeys: Map<AnonymousSessionId, EncryptionKeys>;
  private readonly dtlsFingerprints: Map<AnonymousSessionId, string>;

  constructor() {
    this.sessionKeys = new Map();
    this.dtlsFingerprints = new Map();
  }

  /**
   * Generate encryption configuration for a new session
   */
  public async generateEncryptionConfig(sessionId: AnonymousSessionId): Promise<MediaEncryptionInfo> {
    try {
      // Generate DTLS configuration
      const dtlsConfig = await this.generateDTLSConfig(sessionId);
      
      // Generate SRTP configuration
      const srtpConfig = await this.generateSRTPConfig(sessionId);
      
      // Generate encryption keys
      const keys = await this.generateEncryptionKeys(sessionId);
      
      // Store keys for session
      this.sessionKeys.set(sessionId, keys);
      this.dtlsFingerprints.set(sessionId, dtlsConfig.fingerprint);

      const encryptionInfo: MediaEncryptionInfo = {
        dtls: dtlsConfig,
        srtp: srtpConfig,
        keys
      };

      logger.info(`Generated encryption configuration for session: ${sessionId}`);
      return encryptionInfo;
    } catch (error) {
      logger.error(`Failed to generate encryption config for session ${sessionId}:`, error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Validate DTLS fingerprint for incoming connection
   */
  public validateDTLSFingerprint(sessionId: AnonymousSessionId, fingerprint: string): boolean {
    const expectedFingerprint = this.dtlsFingerprints.get(sessionId);
    if (!expectedFingerprint) {
      logger.warn(`No DTLS fingerprint found for session: ${sessionId}`);
      return false;
    }

    const isValid = expectedFingerprint === fingerprint;
    if (!isValid) {
      logger.error(`DTLS fingerprint validation failed for session: ${sessionId}`);
    }

    return isValid;
  }

  /**
   * Get encryption keys for session
   */
  public getEncryptionKeys(sessionId: AnonymousSessionId): EncryptionKeys | undefined {
    return this.sessionKeys.get(sessionId);
  }

  /**
   * Encrypt signaling message payload
   */
  public encryptSignalingPayload(sessionId: AnonymousSessionId, payload: any): string {
    const keys = this.sessionKeys.get(sessionId);
    if (!keys) {
      throw new Error(`No encryption keys found for session: ${sessionId}`);
    }

    try {
      const payloadStr = JSON.stringify(payload);
      const cipher = createCipher('aes-256-gcm', keys.masterKey);
      
      let encrypted = cipher.update(payloadStr, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Include authentication tag for integrity
      const authTag = (cipher as any).getAuthTag();
      
      return JSON.stringify({
        encrypted,
        authTag: authTag.toString('hex'),
        algorithm: 'aes-256-gcm'
      });
    } catch (error) {
      logger.error(`Failed to encrypt signaling payload for session ${sessionId}:`, error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Decrypt signaling message payload
   */
  public decryptSignalingPayload(sessionId: AnonymousSessionId, encryptedPayload: string): any {
    const keys = this.sessionKeys.get(sessionId);
    if (!keys) {
      throw new Error(`No encryption keys found for session: ${sessionId}`);
    }

    try {
      const { encrypted, authTag, algorithm } = JSON.parse(encryptedPayload);
      
      if (algorithm !== 'aes-256-gcm') {
        throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
      }

      const decipher = createDecipher('aes-256-gcm', keys.masterKey);
      (decipher as any).setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      logger.error(`Failed to decrypt signaling payload for session ${sessionId}:`, error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Generate SRTP key material for media encryption
   */
  public generateSRTPKeyMaterial(sessionId: AnonymousSessionId): { key: Buffer; salt: Buffer } {
    const keys = this.sessionKeys.get(sessionId);
    if (!keys) {
      throw new Error(`No encryption keys found for session: ${sessionId}`);
    }

    // Derive SRTP keys from master key using HKDF-like process
    const srtpKey = createHash('sha256')
      .update(keys.masterKey)
      .update('srtp-key')
      .update(sessionId)
      .digest();

    const srtpSalt = createHash('sha256')
      .update(keys.masterSalt)
      .update('srtp-salt')
      .update(sessionId)
      .digest();

    return {
      key: srtpKey.slice(0, 16), // 128-bit key for AES-128
      salt: srtpSalt.slice(0, 14)  // 112-bit salt for SRTP
    };
  }

  /**
   * Cleanup encryption data for session
   */
  public cleanupSession(sessionId: AnonymousSessionId): void {
    this.sessionKeys.delete(sessionId);
    this.dtlsFingerprints.delete(sessionId);
    logger.debug(`Cleaned up encryption data for session: ${sessionId}`);
  }

  /**
   * Generate DTLS configuration
   */
  private async generateDTLSConfig(sessionId: AnonymousSessionId): Promise<DTLSConfiguration> {
    // Generate certificate fingerprint (in production, use actual certificate)
    const certData = randomBytes(32);
    const fingerprint = createHash('sha256').update(certData).digest('hex');
    
    // Format fingerprint with colons (standard DTLS format)
    const formattedFingerprint = fingerprint.match(/.{2}/g)?.join(':').toUpperCase() || fingerprint;

    return {
      fingerprint: formattedFingerprint,
      algorithm: 'sha-256',
      setup: 'actpass' // Allow both active and passive roles
    };
  }

  /**
   * Generate SRTP configuration
   */
  private async generateSRTPConfig(sessionId: AnonymousSessionId): Promise<SRTPConfiguration> {
    // Generate SRTP key parameters
    const masterKey = randomBytes(16); // 128-bit master key
    const masterSalt = randomBytes(14); // 112-bit master salt
    
    // Encode key parameters in base64
    const keyParams = Buffer.concat([masterKey, masterSalt]).toString('base64');

    return {
      cryptoSuite: 'AES_CM_128_HMAC_SHA1_80',
      keyParams: `inline:${keyParams}`,
      sessionParams: 'KDR=0' // Key Derivation Rate = 0 (no re-keying)
    };
  }

  /**
   * Generate encryption keys for session
   */
  private async generateEncryptionKeys(sessionId: AnonymousSessionId): Promise<EncryptionKeys> {
    // Generate cryptographically secure keys
    const masterKey = randomBytes(32); // 256-bit master key
    const masterSalt = randomBytes(16); // 128-bit master salt

    return {
      masterKey,
      masterSalt,
      keyDerivationRate: 0 // No automatic re-keying
    };
  }

  /**
   * Validate encryption strength
   */
  public validateEncryptionStrength(encryptionInfo: MediaEncryptionInfo): boolean {
    // Validate DTLS configuration
    if (encryptionInfo.dtls.algorithm !== 'sha-256') {
      logger.warn('DTLS algorithm is not SHA-256');
      return false;
    }

    // Validate SRTP configuration
    if (!encryptionInfo.srtp.cryptoSuite.includes('AES_CM_128')) {
      logger.warn('SRTP crypto suite does not use AES-128');
      return false;
    }

    // Validate key lengths
    if (encryptionInfo.keys.masterKey.length < 32) {
      logger.warn('Master key length is insufficient');
      return false;
    }

    if (encryptionInfo.keys.masterSalt.length < 16) {
      logger.warn('Master salt length is insufficient');
      return false;
    }

    return true;
  }

  /**
   * Get supported crypto suites
   */
  public getSupportedCryptoSuites(): string[] {
    return [
      'AES_CM_128_HMAC_SHA1_80',
      'AES_CM_128_HMAC_SHA1_32',
      'AES_256_CM_HMAC_SHA1_80',
      'AES_256_CM_HMAC_SHA1_32'
    ];
  }

  /**
   * Cleanup all encryption data
   */
  public cleanup(): void {
    this.sessionKeys.clear();
    this.dtlsFingerprints.clear();
    logger.info('Cleaned up all encryption data');
  }
}

export const encryptionManager = new EncryptionManager();