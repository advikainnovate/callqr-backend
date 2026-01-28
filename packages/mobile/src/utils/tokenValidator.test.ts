/**
 * Mobile Token Validator Tests
 * 
 * Unit tests for mobile token validation functionality
 */

import { MobileTokenValidator, defaultMobileTokenValidator } from './tokenValidator';
import { QRScanError } from '../types';

describe('MobileTokenValidator', () => {
  let validator: MobileTokenValidator;

  beforeEach(() => {
    validator = new MobileTokenValidator();
  });

  describe('validateToken', () => {
    it('should validate correctly formatted token', () => {
      const validToken = 'pqc:1:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890:abcd1234';
      
      const result = validator.validateToken(validToken);
      
      expect(result.isValid).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token?.value).toBe('abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
      expect(result.token?.version).toBe(1);
      expect(result.token?.checksum).toBe('abcd1234');
    });

    it('should reject token with invalid format', () => {
      const invalidToken = 'invalid-token-format';
      
      const result = validator.validateToken(invalidToken);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(QRScanError.INVALID_FORMAT);
      expect(result.token).toBeUndefined();
    });

    it('should reject token with wrong prefix', () => {
      const wrongPrefix = 'xyz:1:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890:abcd1234';
      
      const result = validator.validateToken(wrongPrefix);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(QRScanError.INVALID_FORMAT);
    });

    it('should reject token with unsupported version', () => {
      const unsupportedVersion = 'pqc:2:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890:abcd1234';
      
      const result = validator.validateToken(unsupportedVersion);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(QRScanError.UNSUPPORTED_VERSION);
    });

    it('should reject token with invalid length', () => {
      const shortToken = 'pqc:1:abcdef123456:abcd1234';
      
      const result = validator.validateToken(shortToken);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(QRScanError.INVALID_FORMAT);
    });

    it('should reject token with non-hex characters', () => {
      const nonHexToken = 'pqc:1:ghijkl1234567890abcdef1234567890abcdef1234567890abcdef1234567890:abcd1234';
      
      const result = validator.validateToken(nonHexToken);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(QRScanError.INVALID_FORMAT);
    });

    it('should reject token with invalid checksum format', () => {
      const invalidChecksum = 'pqc:1:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890:wrongsum';
      
      const result = validator.validateToken(invalidChecksum);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(QRScanError.INVALID_CHECKSUM);
    });

    it('should accept token with valid checksum format', () => {
      const validChecksum = 'pqc:1:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890:abcd1234';
      
      const result = validator.validateToken(validChecksum);
      
      expect(result.isValid).toBe(true);
      expect(result.token?.checksum).toBe('abcd1234');
    });

    it('should handle malformed data gracefully', () => {
      const malformedData = 'pqc:1:';
      
      const result = validator.validateToken(malformedData);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(QRScanError.INVALID_FORMAT);
    });

    it('should handle empty string', () => {
      const result = validator.validateToken('');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(QRScanError.INVALID_FORMAT);
    });
  });

  describe('extractTokenFromQR', () => {
    it('should extract valid token from QR data', () => {
      const validQRData = 'pqc:1:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890:abcd1234';
      
      const token = validator.extractTokenFromQR(validQRData);
      
      expect(token).toBeDefined();
      expect(token?.value).toBe('abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
      expect(token?.version).toBe(1);
    });

    it('should return null for invalid QR data', () => {
      const invalidQRData = 'invalid-qr-data';
      
      const token = validator.extractTokenFromQR(invalidQRData);
      
      expect(token).toBeNull();
    });
  });

  describe('isValidQRFormat', () => {
    it('should recognize valid QR format', () => {
      const validFormat = 'pqc:1:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890:abcd1234';
      
      const isValid = validator.isValidQRFormat(validFormat);
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid QR format', () => {
      const invalidFormat = 'xyz:1:token:checksum';
      
      const isValid = validator.isValidQRFormat(invalidFormat);
      
      expect(isValid).toBe(false);
    });

    it('should reject empty string', () => {
      const isValid = validator.isValidQRFormat('');
      
      expect(isValid).toBe(false);
    });
  });

  describe('default instance', () => {
    it('should provide working default instance', () => {
      const validToken = 'pqc:1:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890:abcd1234';
      
      const result = defaultMobileTokenValidator.validateToken(validToken);
      
      expect(result.isValid).toBe(true);
      expect(result.token).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle tokens with mixed case hex', () => {
      const mixedCaseToken = 'pqc:1:AbCdEf1234567890abcdef1234567890abcdef1234567890abcdef1234567890:AbCd1234';
      
      const result = validator.validateToken(mixedCaseToken);
      
      expect(result.isValid).toBe(true);
      expect(result.token?.value).toBe('AbCdEf1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
    });

    it('should handle tokens with extra colons', () => {
      const extraColons = 'pqc:1:abcdef:1234567890:abcdef1234567890abcdef1234567890abcdef1234567890:abcd1234';
      
      const result = validator.validateToken(extraColons);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(QRScanError.INVALID_FORMAT);
    });

    it('should handle tokens with missing parts', () => {
      const missingParts = 'pqc:1:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      
      const result = validator.validateToken(missingParts);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(QRScanError.INVALID_FORMAT);
    });
  });
});