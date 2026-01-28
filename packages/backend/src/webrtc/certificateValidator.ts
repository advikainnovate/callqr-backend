/**
 * Certificate Validator
 * Handles certificate validation for secure WebRTC connections
 */

import { createHash } from 'crypto';
import { logger } from '../utils/logger';

export interface CertificateInfo {
  readonly subject: string;
  readonly issuer: string;
  readonly validFrom: Date;
  readonly validTo: Date;
  readonly fingerprint: string;
  readonly algorithm: string;
  readonly keyUsage: string[];
  readonly extendedKeyUsage: string[];
}

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
  readonly certificate: CertificateInfo | null;
}

export interface CertificateValidationOptions {
  readonly allowSelfSigned: boolean;
  readonly checkRevocation: boolean;
  readonly requireExtendedValidation: boolean;
  readonly maxCertificateAge: number; // in days
  readonly requiredKeyUsages: string[];
}

export class CertificateValidator {
  private readonly defaultOptions: CertificateValidationOptions;
  private readonly trustedCertificates: Map<string, CertificateInfo>;
  private readonly revokedCertificates: Set<string>;

  constructor() {
    this.defaultOptions = {
      allowSelfSigned: process.env.NODE_ENV !== 'production',
      checkRevocation: true,
      requireExtendedValidation: false,
      maxCertificateAge: 365, // 1 year
      requiredKeyUsages: ['digitalSignature', 'keyEncipherment']
    };
    
    this.trustedCertificates = new Map();
    this.revokedCertificates = new Set();
    
    this.loadTrustedCertificates();
    this.loadRevokedCertificates();
  }

  /**
   * Validate certificate for WebRTC connection
   */
  public async validateCertificate(
    certificateData: string | Buffer,
    options?: Partial<CertificateValidationOptions>
  ): Promise<ValidationResult> {
    const validationOptions = { ...this.defaultOptions, ...options };
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Parse certificate (in production, use actual certificate parsing library)
      const certificate = this.parseCertificate(certificateData);
      
      if (!certificate) {
        errors.push('Failed to parse certificate');
        return { isValid: false, errors, warnings, certificate: null };
      }

      // Validate certificate chain
      await this.validateCertificateChain(certificate, validationOptions, errors, warnings);
      
      // Validate certificate dates
      this.validateCertificateDates(certificate, validationOptions, errors, warnings);
      
      // Validate key usage
      this.validateKeyUsage(certificate, validationOptions, errors, warnings);
      
      // Check revocation status
      if (validationOptions.checkRevocation) {
        await this.checkRevocationStatus(certificate, errors, warnings);
      }
      
      // Validate certificate purpose for WebRTC
      this.validateWebRTCPurpose(certificate, errors, warnings);

      const isValid = errors.length === 0;
      
      if (isValid) {
        logger.info(`Certificate validation successful: ${certificate.subject}`);
      } else {
        logger.error(`Certificate validation failed: ${errors.join(', ')}`);
      }

      return {
        isValid,
        errors,
        warnings,
        certificate
      };
    } catch (error) {
      logger.error('Certificate validation error:', error as Record<string, unknown>);
      errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        isValid: false,
        errors,
        warnings,
        certificate: null
      };
    }
  }

  /**
   * Validate DTLS fingerprint
   */
  public validateDTLSFingerprint(
    certificate: CertificateInfo,
    providedFingerprint: string,
    algorithm: string = 'sha-256'
  ): boolean {
    try {
      // Normalize fingerprint format
      const normalizedProvided = providedFingerprint.replace(/:/g, '').toLowerCase();
      const normalizedCert = certificate.fingerprint.replace(/:/g, '').toLowerCase();
      
      if (normalizedProvided !== normalizedCert) {
        logger.error('DTLS fingerprint mismatch');
        return false;
      }

      if (certificate.algorithm.toLowerCase() !== algorithm.toLowerCase()) {
        logger.error(`DTLS algorithm mismatch: expected ${algorithm}, got ${certificate.algorithm}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('DTLS fingerprint validation error:', error as Record<string, unknown>);
      return false;
    }
  }

  /**
   * Generate certificate fingerprint
   */
  public generateFingerprint(certificateData: string | Buffer, algorithm: string = 'sha256'): string {
    try {
      const data = typeof certificateData === 'string' 
        ? Buffer.from(certificateData, 'base64') 
        : certificateData;
      
      const hash = createHash(algorithm).update(data).digest('hex');
      
      // Format with colons (standard format)
      return hash.match(/.{2}/g)?.join(':').toUpperCase() || hash;
    } catch (error) {
      logger.error('Error generating certificate fingerprint:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Add trusted certificate
   */
  public addTrustedCertificate(certificate: CertificateInfo): void {
    this.trustedCertificates.set(certificate.fingerprint, certificate);
    logger.info(`Added trusted certificate: ${certificate.subject}`);
  }

  /**
   * Add revoked certificate
   */
  public addRevokedCertificate(fingerprint: string): void {
    this.revokedCertificates.add(fingerprint);
    logger.info(`Added revoked certificate: ${fingerprint}`);
  }

  /**
   * Check if certificate is trusted
   */
  public isTrustedCertificate(fingerprint: string): boolean {
    return this.trustedCertificates.has(fingerprint);
  }

  /**
   * Check if certificate is revoked
   */
  public isRevokedCertificate(fingerprint: string): boolean {
    return this.revokedCertificates.has(fingerprint);
  }

  /**
   * Parse certificate data (mock implementation)
   */
  private parseCertificate(certificateData: string | Buffer): CertificateInfo | null {
    try {
      // In production, use a proper certificate parsing library like 'node-forge' or 'x509'
      // This is a mock implementation for demonstration
      
      const data = typeof certificateData === 'string' 
        ? Buffer.from(certificateData, 'base64') 
        : certificateData;
      
      const fingerprint = this.generateFingerprint(data);
      
      // Mock certificate info (in production, parse actual certificate)
      const certificate: CertificateInfo = {
        subject: 'CN=webrtc.example.com',
        issuer: 'CN=Example CA',
        validFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        fingerprint,
        algorithm: 'sha-256',
        keyUsage: ['digitalSignature', 'keyEncipherment'],
        extendedKeyUsage: ['serverAuth', 'clientAuth']
      };

      return certificate;
    } catch (error) {
      logger.error('Error parsing certificate:', error as Record<string, unknown>);
      return null;
    }
  }

  /**
   * Validate certificate chain
   */
  private async validateCertificateChain(
    certificate: CertificateInfo,
    options: CertificateValidationOptions,
    errors: string[],
    warnings: string[]
  ): Promise<void> {
    // Check if self-signed
    const isSelfSigned = certificate.subject === certificate.issuer;
    
    if (isSelfSigned && !options.allowSelfSigned) {
      errors.push('Self-signed certificates are not allowed');
      return;
    }

    if (isSelfSigned && options.allowSelfSigned) {
      warnings.push('Using self-signed certificate');
    }

    // In production, validate the full certificate chain
    // For now, we'll just check if it's in our trusted certificates
    if (!isSelfSigned && !this.isTrustedCertificate(certificate.fingerprint)) {
      warnings.push('Certificate is not in trusted certificate store');
    }
  }

  /**
   * Validate certificate dates
   */
  private validateCertificateDates(
    certificate: CertificateInfo,
    options: CertificateValidationOptions,
    errors: string[],
    warnings: string[]
  ): void {
    const now = new Date();
    
    if (now < certificate.validFrom) {
      errors.push('Certificate is not yet valid');
    }
    
    if (now > certificate.validTo) {
      errors.push('Certificate has expired');
    }

    // Check certificate age
    const ageInDays = (now.getTime() - certificate.validFrom.getTime()) / (24 * 60 * 60 * 1000);
    if (ageInDays > options.maxCertificateAge) {
      warnings.push(`Certificate is older than ${options.maxCertificateAge} days`);
    }

    // Check expiration warning
    const daysUntilExpiry = (certificate.validTo.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    if (daysUntilExpiry < 30) {
      warnings.push(`Certificate expires in ${Math.floor(daysUntilExpiry)} days`);
    }
  }

  /**
   * Validate key usage
   */
  private validateKeyUsage(
    certificate: CertificateInfo,
    options: CertificateValidationOptions,
    errors: string[],
    warnings: string[]
  ): void {
    for (const requiredUsage of options.requiredKeyUsages) {
      if (!certificate.keyUsage.includes(requiredUsage)) {
        errors.push(`Certificate missing required key usage: ${requiredUsage}`);
      }
    }

    // Check for WebRTC-specific extended key usage
    const webrtcUsages = ['serverAuth', 'clientAuth'];
    const hasWebRTCUsage = webrtcUsages.some(usage => 
      certificate.extendedKeyUsage.includes(usage)
    );

    if (!hasWebRTCUsage) {
      warnings.push('Certificate may not be suitable for WebRTC connections');
    }
  }

  /**
   * Check certificate revocation status
   */
  private async checkRevocationStatus(
    certificate: CertificateInfo,
    errors: string[],
    warnings: string[]
  ): Promise<void> {
    if (this.isRevokedCertificate(certificate.fingerprint)) {
      errors.push('Certificate has been revoked');
      return;
    }

    // In production, check OCSP or CRL
    // For now, we'll just log that we're checking
    logger.debug(`Checking revocation status for certificate: ${certificate.fingerprint}`);
  }

  /**
   * Validate certificate for WebRTC purpose
   */
  private validateWebRTCPurpose(
    certificate: CertificateInfo,
    errors: string[],
    warnings: string[]
  ): void {
    // Check if certificate is suitable for WebRTC DTLS
    if (!certificate.keyUsage.includes('digitalSignature')) {
      errors.push('Certificate must support digital signatures for DTLS');
    }

    if (!certificate.keyUsage.includes('keyEncipherment') && 
        !certificate.keyUsage.includes('keyAgreement')) {
      errors.push('Certificate must support key encipherment or key agreement for DTLS');
    }

    // Check algorithm strength
    if (certificate.algorithm === 'sha-1') {
      errors.push('SHA-1 certificates are not secure for WebRTC');
    }
  }

  /**
   * Load trusted certificates from configuration
   */
  private loadTrustedCertificates(): void {
    // In production, load from certificate store or configuration
    logger.debug('Loading trusted certificates');
  }

  /**
   * Load revoked certificates from CRL or configuration
   */
  private loadRevokedCertificates(): void {
    // In production, load from CRL or OCSP
    logger.debug('Loading revoked certificates');
  }

  /**
   * Cleanup certificate validator
   */
  public cleanup(): void {
    this.trustedCertificates.clear();
    this.revokedCertificates.clear();
    logger.info('Certificate validator cleaned up');
  }
}

export const certificateValidator = new CertificateValidator();