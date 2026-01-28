/**
 * Token Generator Tests
 * 
 * Unit tests for the secure token generation system.
 */

import { TokenGenerator } from './tokenGenerator';
import { TokenValidationError } from './types';

describe('TokenGenerator', () => {
  let generator: TokenGenerator;

  beforeEach(() => {
    generator = new TokenGenerator();
  });

  describe('generateToken', () => {
    it('should generate a token with correct properties', () => {
      const token = generator.generateToken();

      expect(token.value).toBeDefined();
      expect(token.version).toBe(1);
      expect(token.checksum).toBeDefined();
      expect(token.createdAt).toBeInstanceOf(Date);
      expect(token.value.length).toBe(64); // 256 bits = 64 hex chars
    });

    it('should generate unique tokens', () => {
      const token1 = generator.generateToken();
      const token2 = generator.generateToken();

      expect(token1.value).not.toBe(token2.value);
      expect(token1.checksum).not.toBe(token2.checksum);
    });

    it('should generate tokens with valid hex format', () => {
      const token = generator.generateToken();
      expect(token.value).toMatch(/^[0-9a-f]{64}$/i);
    });
  });

  describe('validateToken', () => {
    it('should validate a correctly formatted token', () => {
      const token = generator.generateToken();
      const qrData = generator.formatForQR(token);
      const result = generator.validateToken(qrData);

      expect(result.isValid).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token!.value).toBe(token.value);
    });

    it('should reject invalid format', () => {
      const result = generator.validateToken('invalid:format');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(TokenValidationError.INVALID_FORMAT);
    });

    it('should reject wrong prefix', () => {
      const result = generator.validateToken('wrong:1:abcd:1234');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(TokenValidationError.INVALID_FORMAT);
    });

    it('should reject invalid checksum', () => {
      const token = generator.generateToken();
      const qrData = generator.formatForQR(token);
      const tamperedData = qrData.replace(/:[^:]+$/, ':wrongchecksum');
      const result = generator.validateToken(tamperedData);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(TokenValidationError.INVALID_CHECKSUM);
    });
  });

  describe('formatForQR and extractFromQR', () => {
    it('should format and extract tokens correctly', () => {
      const originalToken = generator.generateToken();
      const qrData = generator.formatForQR(originalToken);
      const extractedToken = generator.extractFromQR(qrData);

      expect(extractedToken).toBeDefined();
      expect(extractedToken!.value).toBe(originalToken.value);
      expect(extractedToken!.version).toBe(originalToken.version);
      expect(extractedToken!.checksum).toBe(originalToken.checksum);
    });

    it('should return null for invalid QR data', () => {
      const result = generator.extractFromQR('invalid-qr-data');
      expect(result).toBeNull();
    });
  });
});