/**
 * Connection Security Manager
 * Handles security checks and validation for WebRTC connections
 */

import { AnonymousSessionId } from './types';
import { certificateValidator, ValidationResult } from './certificateValidator';
import { logger } from '../utils/logger';

export interface ConnectionSecurityInfo {
  readonly sessionId: AnonymousSessionId;
  readonly tlsVersion: string;
  readonly cipherSuite: string;
  readonly certificateValid: boolean;
  readonly encryptionStrength: 'weak' | 'medium' | 'strong';
  readonly securityLevel: number; // 0-100
  readonly warnings: string[];
  readonly errors: string[];
}

export interface SecurityPolicy {
  readonly minTlsVersion: string;
  readonly allowedCipherSuites: string[];
  readonly requireCertificateValidation: boolean;
  readonly minEncryptionStrength: 'weak' | 'medium' | 'strong';
  readonly minSecurityLevel: number;
  readonly blockWeakConnections: boolean;
}

export class ConnectionSecurityManager {
  private readonly defaultPolicy: SecurityPolicy;
  private readonly sessionSecurity: Map<AnonymousSessionId, ConnectionSecurityInfo>;
  private readonly securityEvents: Array<{ timestamp: Date; event: string; sessionId: AnonymousSessionId }>;

  constructor() {
    this.defaultPolicy = {
      minTlsVersion: 'TLSv1.2',
      allowedCipherSuites: [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'TLS_AES_128_GCM_SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-GCM-SHA256'
      ],
      requireCertificateValidation: true,
      minEncryptionStrength: 'medium',
      minSecurityLevel: 70,
      blockWeakConnections: process.env.NODE_ENV === 'production'
    };

    this.sessionSecurity = new Map();
    this.securityEvents = [];
  }

  /**
   * Validate connection security for WebRTC session
   */
  public async validateConnectionSecurity(
    sessionId: AnonymousSessionId,
    connectionInfo: {
      tlsVersion?: string;
      cipherSuite?: string;
      certificate?: string | Buffer;
      remoteAddress?: string;
    },
    policy?: Partial<SecurityPolicy>
  ): Promise<ConnectionSecurityInfo> {
    const securityPolicy = { ...this.defaultPolicy, ...policy };
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validate TLS version
      const tlsVersion = connectionInfo.tlsVersion || 'unknown';
      this.validateTlsVersion(tlsVersion, securityPolicy, errors, warnings);

      // Validate cipher suite
      const cipherSuite = connectionInfo.cipherSuite || 'unknown';
      this.validateCipherSuite(cipherSuite, securityPolicy, errors, warnings);

      // Validate certificate if provided
      let certificateValid = false;
      if (connectionInfo.certificate && securityPolicy.requireCertificateValidation) {
        const certValidation = await certificateValidator.validateCertificate(connectionInfo.certificate);
        certificateValid = certValidation.isValid;
        
        if (!certificateValid) {
          errors.push(...certValidation.errors);
          warnings.push(...certValidation.warnings);
        }
      } else if (securityPolicy.requireCertificateValidation) {
        errors.push('Certificate validation required but no certificate provided');
      }

      // Determine encryption strength
      const encryptionStrength = this.determineEncryptionStrength(tlsVersion, cipherSuite);
      
      // Validate encryption strength
      if (!this.isEncryptionStrengthAcceptable(encryptionStrength, securityPolicy.minEncryptionStrength)) {
        errors.push(`Encryption strength ${encryptionStrength} below minimum ${securityPolicy.minEncryptionStrength}`);
      }

      // Calculate security level
      const securityLevel = this.calculateSecurityLevel(tlsVersion, cipherSuite, certificateValid, encryptionStrength);
      
      // Validate security level
      if (securityLevel < securityPolicy.minSecurityLevel) {
        errors.push(`Security level ${securityLevel} below minimum ${securityPolicy.minSecurityLevel}`);
      }

      const securityInfo: ConnectionSecurityInfo = {
        sessionId,
        tlsVersion,
        cipherSuite,
        certificateValid,
        encryptionStrength,
        securityLevel,
        warnings,
        errors
      };

      // Store security info
      this.sessionSecurity.set(sessionId, securityInfo);

      // Log security event
      const isSecure = errors.length === 0;
      this.logSecurityEvent(sessionId, isSecure ? 'connection-secure' : 'connection-insecure');

      // Block connection if policy requires it and connection is insecure
      if (!isSecure && securityPolicy.blockWeakConnections) {
        throw new Error(`Connection blocked due to security policy violations: ${errors.join(', ')}`);
      }

      if (isSecure) {
        logger.info(`Connection security validated for session: ${sessionId} (level: ${securityLevel})`);
      } else {
        logger.warn(`Connection security issues for session: ${sessionId} - ${errors.join(', ')}`);
      }

      return securityInfo;
    } catch (error) {
      logger.error(`Connection security validation failed for session ${sessionId}:`, error as Record<string, unknown>);
      
      const failedSecurityInfo: ConnectionSecurityInfo = {
        sessionId,
        tlsVersion: connectionInfo.tlsVersion || 'unknown',
        cipherSuite: connectionInfo.cipherSuite || 'unknown',
        certificateValid: false,
        encryptionStrength: 'weak',
        securityLevel: 0,
        warnings,
        errors: [...errors, error instanceof Error ? error.message : 'Unknown error']
      };

      this.sessionSecurity.set(sessionId, failedSecurityInfo);
      this.logSecurityEvent(sessionId, 'validation-failed');

      return failedSecurityInfo;
    }
  }

  /**
   * Get security information for session
   */
  public getSessionSecurity(sessionId: AnonymousSessionId): ConnectionSecurityInfo | undefined {
    return this.sessionSecurity.get(sessionId);
  }

  /**
   * Check if connection meets security requirements
   */
  public isConnectionSecure(sessionId: AnonymousSessionId): boolean {
    const securityInfo = this.sessionSecurity.get(sessionId);
    return securityInfo ? securityInfo.errors.length === 0 : false;
  }

  /**
   * Get security events for monitoring
   */
  public getSecurityEvents(limit: number = 100): Array<{ timestamp: Date; event: string; sessionId: AnonymousSessionId }> {
    return this.securityEvents.slice(-limit);
  }

  /**
   * Cleanup session security data
   */
  public cleanupSession(sessionId: AnonymousSessionId): void {
    this.sessionSecurity.delete(sessionId);
    this.logSecurityEvent(sessionId, 'session-cleanup');
    logger.debug(`Cleaned up security data for session: ${sessionId}`);
  }

  /**
   * Validate TLS version
   */
  private validateTlsVersion(
    tlsVersion: string,
    policy: SecurityPolicy,
    errors: string[],
    warnings: string[]
  ): void {
    const tlsVersions = ['TLSv1.0', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'];
    const minIndex = tlsVersions.indexOf(policy.minTlsVersion);
    const currentIndex = tlsVersions.indexOf(tlsVersion);

    if (currentIndex === -1) {
      errors.push(`Unknown TLS version: ${tlsVersion}`);
      return;
    }

    if (currentIndex < minIndex) {
      errors.push(`TLS version ${tlsVersion} below minimum ${policy.minTlsVersion}`);
    }

    if (tlsVersion === 'TLSv1.0' || tlsVersion === 'TLSv1.1') {
      warnings.push(`TLS version ${tlsVersion} is deprecated`);
    }
  }

  /**
   * Validate cipher suite
   */
  private validateCipherSuite(
    cipherSuite: string,
    policy: SecurityPolicy,
    errors: string[],
    warnings: string[]
  ): void {
    if (!policy.allowedCipherSuites.includes(cipherSuite)) {
      errors.push(`Cipher suite ${cipherSuite} not in allowed list`);
    }

    // Check for weak cipher suites
    const weakCiphers = ['RC4', 'DES', '3DES', 'MD5'];
    if (weakCiphers.some(weak => cipherSuite.includes(weak))) {
      errors.push(`Weak cipher suite detected: ${cipherSuite}`);
    }

    // Check for deprecated cipher suites
    const deprecatedCiphers = ['SHA1', 'CBC'];
    if (deprecatedCiphers.some(deprecated => cipherSuite.includes(deprecated))) {
      warnings.push(`Deprecated cipher suite: ${cipherSuite}`);
    }
  }

  /**
   * Determine encryption strength based on TLS version and cipher suite
   */
  private determineEncryptionStrength(tlsVersion: string, cipherSuite: string): 'weak' | 'medium' | 'strong' {
    // Strong encryption
    if (tlsVersion === 'TLSv1.3' && cipherSuite.includes('AES_256')) {
      return 'strong';
    }

    if (cipherSuite.includes('AES_256') || cipherSuite.includes('CHACHA20')) {
      return 'strong';
    }

    // Medium encryption
    if (tlsVersion === 'TLSv1.2' && cipherSuite.includes('AES_128')) {
      return 'medium';
    }

    if (cipherSuite.includes('AES_128')) {
      return 'medium';
    }

    // Weak encryption (everything else)
    return 'weak';
  }

  /**
   * Check if encryption strength is acceptable
   */
  private isEncryptionStrengthAcceptable(
    current: 'weak' | 'medium' | 'strong',
    minimum: 'weak' | 'medium' | 'strong'
  ): boolean {
    const levels = { weak: 1, medium: 2, strong: 3 };
    return levels[current] >= levels[minimum];
  }

  /**
   * Calculate overall security level (0-100)
   */
  private calculateSecurityLevel(
    tlsVersion: string,
    cipherSuite: string,
    certificateValid: boolean,
    encryptionStrength: 'weak' | 'medium' | 'strong'
  ): number {
    let score = 0;

    // TLS version score (0-30)
    switch (tlsVersion) {
      case 'TLSv1.3': score += 30; break;
      case 'TLSv1.2': score += 25; break;
      case 'TLSv1.1': score += 15; break;
      case 'TLSv1.0': score += 10; break;
      default: score += 0;
    }

    // Cipher suite score (0-30)
    if (cipherSuite.includes('AES_256') || cipherSuite.includes('CHACHA20')) {
      score += 30;
    } else if (cipherSuite.includes('AES_128')) {
      score += 25;
    } else if (cipherSuite.includes('AES')) {
      score += 20;
    } else {
      score += 10;
    }

    // Certificate validation score (0-20)
    if (certificateValid) {
      score += 20;
    }

    // Encryption strength score (0-20)
    switch (encryptionStrength) {
      case 'strong': score += 20; break;
      case 'medium': score += 15; break;
      case 'weak': score += 5; break;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Log security event
   */
  private logSecurityEvent(sessionId: AnonymousSessionId, event: string): void {
    this.securityEvents.push({
      timestamp: new Date(),
      event,
      sessionId
    });

    // Keep only last 1000 events
    if (this.securityEvents.length > 1000) {
      this.securityEvents.splice(0, this.securityEvents.length - 1000);
    }

    logger.debug(`Security event: ${event} for session: ${sessionId}`);
  }

  /**
   * Get security statistics
   */
  public getSecurityStatistics(): {
    totalSessions: number;
    secureSessions: number;
    averageSecurityLevel: number;
    commonIssues: string[];
  } {
    const sessions = Array.from(this.sessionSecurity.values());
    const secureSessions = sessions.filter(s => s.errors.length === 0);
    const averageSecurityLevel = sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + s.securityLevel, 0) / sessions.length 
      : 0;

    // Count common issues
    const issueCount = new Map<string, number>();
    sessions.forEach(session => {
      session.errors.forEach(error => {
        issueCount.set(error, (issueCount.get(error) || 0) + 1);
      });
    });

    const commonIssues = Array.from(issueCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([issue]) => issue);

    return {
      totalSessions: sessions.length,
      secureSessions: secureSessions.length,
      averageSecurityLevel: Math.round(averageSecurityLevel),
      commonIssues
    };
  }

  /**
   * Cleanup all security data
   */
  public cleanup(): void {
    this.sessionSecurity.clear();
    this.securityEvents.length = 0;
    logger.info('Connection security manager cleaned up');
  }
}

export const connectionSecurityManager = new ConnectionSecurityManager();