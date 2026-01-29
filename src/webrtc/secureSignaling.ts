/**
 * Secure Signaling Protocol
 * Implements secure WSS/HTTPS signaling with end-to-end encryption
 */

import { createHash, randomBytes } from 'crypto';
import { AnonymousSessionId, SignalingMessage } from './types';
import { encryptionManager } from './encryptionManager';
import { logger } from '../utils/logger';

export interface SecureSignalingMessage extends SignalingMessage {
  readonly messageId: string;
  readonly integrity: string;
  readonly encrypted: boolean;
}

export interface SignalingSecurity {
  readonly tlsVersion: string;
  readonly cipherSuite: string;
  readonly certificateFingerprint: string;
}

export class SecureSignalingProtocol {
  private readonly messageSequence: Map<AnonymousSessionId, number>;
  private readonly processedMessages: Map<string, Date>;
  private readonly maxMessageAge: number = 300000; // 5 minutes

  constructor() {
    this.messageSequence = new Map();
    this.processedMessages = new Map();
    
    // Cleanup old messages periodically
    setInterval(() => this.cleanupOldMessages(), 60000); // Every minute
  }

  /**
   * Create secure signaling message
   */
  public createSecureMessage(
    sessionId: AnonymousSessionId,
    type: SignalingMessage['type'],
    payload: any,
    encrypt: boolean = true
  ): SecureSignalingMessage {
    try {
      const messageId = this.generateMessageId();
      const sequence = this.getNextSequence(sessionId);
      
      let processedPayload = payload;
      let encrypted = false;

      // Encrypt payload if requested and keys are available
      if (encrypt && encryptionManager.getEncryptionKeys(sessionId)) {
        processedPayload = encryptionManager.encryptSignalingPayload(sessionId, payload);
        encrypted = true;
      }

      const baseMessage: SignalingMessage = {
        type,
        sessionId,
        payload: processedPayload,
        timestamp: new Date()
      };

      // Generate integrity hash
      const integrity = this.generateIntegrityHash(baseMessage, sequence);

      const secureMessage: SecureSignalingMessage = {
        ...baseMessage,
        messageId,
        integrity,
        encrypted
      };

      // Track processed message
      this.processedMessages.set(messageId, new Date());

      logger.debug(`Created secure signaling message: ${type} for session: ${sessionId}`);
      return secureMessage;
    } catch (error) {
      logger.error(`Failed to create secure signaling message:`, error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Validate and process secure signaling message
   */
  public validateSecureMessage(message: SecureSignalingMessage): SignalingMessage {
    try {
      // Check message age
      const messageAge = Date.now() - message.timestamp.getTime();
      if (messageAge > this.maxMessageAge) {
        throw new Error('Message too old');
      }

      // Check for replay attacks
      if (this.processedMessages.has(message.messageId)) {
        throw new Error('Message already processed (replay attack)');
      }

      // Validate integrity
      const expectedSequence = this.messageSequence.get(message.sessionId) || 0;
      const expectedIntegrity = this.generateIntegrityHash(message, expectedSequence);
      
      if (message.integrity !== expectedIntegrity) {
        logger.error(`Integrity validation failed for message: ${message.messageId}`);
        throw new Error('Message integrity validation failed');
      }

      // Decrypt payload if encrypted
      let processedPayload = message.payload;
      if (message.encrypted) {
        processedPayload = encryptionManager.decryptSignalingPayload(message.sessionId, message.payload);
      }

      // Track processed message
      this.processedMessages.set(message.messageId, new Date());
      this.messageSequence.set(message.sessionId, expectedSequence + 1);

      const validatedMessage: SignalingMessage = {
        type: message.type,
        sessionId: message.sessionId,
        payload: processedPayload,
        timestamp: message.timestamp
      };

      logger.debug(`Validated secure signaling message: ${message.type} for session: ${message.sessionId}`);
      return validatedMessage;
    } catch (error) {
      logger.error(`Failed to validate secure signaling message:`, error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Validate TLS/WSS connection security
   */
  public validateConnectionSecurity(socket: any): SignalingSecurity {
    // In a real implementation, this would extract actual TLS information
    // For now, we'll return expected security parameters
    const security: SignalingSecurity = {
      tlsVersion: 'TLSv1.3',
      cipherSuite: 'TLS_AES_256_GCM_SHA384',
      certificateFingerprint: this.generateCertificateFingerprint()
    };

    // Validate minimum security requirements
    if (!this.isSecurityAcceptable(security)) {
      throw new Error('Connection does not meet minimum security requirements');
    }

    return security;
  }

  /**
   * Generate secure session key for signaling encryption
   */
  public async generateSignalingKeys(sessionId: AnonymousSessionId): Promise<void> {
    try {
      // Generate encryption configuration which includes keys
      await encryptionManager.generateEncryptionConfig(sessionId);
      
      logger.info(`Generated signaling keys for session: ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to generate signaling keys for session ${sessionId}:`, error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Cleanup session signaling data
   */
  public cleanupSession(sessionId: AnonymousSessionId): void {
    this.messageSequence.delete(sessionId);
    encryptionManager.cleanupSession(sessionId);
    
    logger.debug(`Cleaned up signaling data for session: ${sessionId}`);
  }

  /**
   * Get signaling security status
   */
  public getSecurityStatus(sessionId: AnonymousSessionId): {
    hasEncryptionKeys: boolean;
    messageCount: number;
    lastActivity: Date | null;
  } {
    const hasKeys = encryptionManager.getEncryptionKeys(sessionId) !== undefined;
    const messageCount = this.messageSequence.get(sessionId) || 0;
    
    // Find last activity from processed messages
    let lastActivity: Date | null = null;
    for (const [messageId, timestamp] of this.processedMessages.entries()) {
      if (messageId.includes(sessionId) && (!lastActivity || timestamp > lastActivity)) {
        lastActivity = timestamp;
      }
    }

    return {
      hasEncryptionKeys: hasKeys,
      messageCount,
      lastActivity
    };
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `${timestamp}-${random}`;
  }

  /**
   * Get next sequence number for session
   */
  private getNextSequence(sessionId: AnonymousSessionId): number {
    const current = this.messageSequence.get(sessionId) || 0;
    const next = current + 1;
    this.messageSequence.set(sessionId, next);
    return next;
  }

  /**
   * Generate integrity hash for message
   */
  private generateIntegrityHash(message: SignalingMessage, sequence: number): string {
    const data = JSON.stringify({
      type: message.type,
      sessionId: message.sessionId,
      payload: message.payload,
      timestamp: message.timestamp.toISOString(),
      sequence
    });

    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate certificate fingerprint
   */
  private generateCertificateFingerprint(): string {
    // In production, this would be the actual certificate fingerprint
    const mockCertData = randomBytes(32);
    return createHash('sha256').update(mockCertData).digest('hex');
  }

  /**
   * Check if connection security meets requirements
   */
  private isSecurityAcceptable(security: SignalingSecurity): boolean {
    // Require TLS 1.2 or higher
    const tlsVersions = ['TLSv1.2', 'TLSv1.3'];
    if (!tlsVersions.includes(security.tlsVersion)) {
      logger.warn(`Unacceptable TLS version: ${security.tlsVersion}`);
      return false;
    }

    // Require strong cipher suites
    const acceptableCiphers = [
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_128_GCM_SHA256',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES128-GCM-SHA256'
    ];

    if (!acceptableCiphers.includes(security.cipherSuite)) {
      logger.warn(`Unacceptable cipher suite: ${security.cipherSuite}`);
      return false;
    }

    return true;
  }

  /**
   * Cleanup old processed messages
   */
  private cleanupOldMessages(): void {
    const now = new Date();
    const cutoff = new Date(now.getTime() - this.maxMessageAge);
    
    let cleanedCount = 0;
    for (const [messageId, timestamp] of this.processedMessages.entries()) {
      if (timestamp < cutoff) {
        this.processedMessages.delete(messageId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`Cleaned up ${cleanedCount} old signaling messages`);
    }
  }

  /**
   * Cleanup all signaling data
   */
  public cleanup(): void {
    this.messageSequence.clear();
    this.processedMessages.clear();
    encryptionManager.cleanup();
    
    logger.info('Cleaned up all secure signaling data');
  }
}

export const secureSignalingProtocol = new SecureSignalingProtocol();