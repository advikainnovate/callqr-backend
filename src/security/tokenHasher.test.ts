/**
 * Token Hasher Tests
 * 
 * Unit tests for the secure token hashing system.
 */

import { TokenHasher } from './tokenHasher';
import { TokenGenerator } from './tokenGenerator';
import { UserId } from './types';

describe('TokenHasher', () => {
  let hasher: TokenHasher;
  let generator: TokenGenerator;

  beforeEach(() => {
    hasher = new TokenHasher();
    generator = new TokenGenerator();
  });

  describe('hashToken', () => {
    it('should create a hash with salt and algorithm info', () => {
      const token = generator.generateToken();
      const hashedToken = hasher.hashToken(token);

      expect(hashedToken.hash).toBeDefined();
      expect(hashedToken.salt).toBeDefined();
      expect(hashedToken.algorithm).toBe('sha256');
      expect(hashedToken.hash.length).toBe(64); // SHA-256 hex length
      expect(hashedToken.salt.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('should generate different hashes for same token (due to salt)', () => {
      const token = generator.generateToken();
      const hash1 = hasher.hashToken(token);
      const hash2 = hasher.hashToken(token);

      expect(hash1.hash).not.toBe(hash2.hash);
      expect(hash1.salt).not.toBe(hash2.salt);
    });
  });

  describe('verifyToken', () => {
    it('should verify a token against its hash', () => {
      const token = generator.generateToken();
      const hashedToken = hasher.hashToken(token);
      const isValid = hasher.verifyToken(token, hashedToken);

      expect(isValid).toBe(true);
    });

    it('should reject wrong token', () => {
      const token1 = generator.generateToken();
      const token2 = generator.generateToken();
      const hashedToken = hasher.hashToken(token1);
      const isValid = hasher.verifyToken(token2, hashedToken);

      expect(isValid).toBe(false);
    });

    it('should reject tampered hash', () => {
      const token = generator.generateToken();
      const hashedToken = hasher.hashToken(token);
      const tamperedHash = {
        ...hashedToken,
        hash: hashedToken.hash.substring(0, hashedToken.hash.length - 1) + 'x'
      };
      const isValid = hasher.verifyToken(token, tamperedHash);

      expect(isValid).toBe(false);
    });
  });

  describe('createTokenMetadata', () => {
    it('should create metadata with correct properties', () => {
      const token = generator.generateToken();
      const userId = 'user123' as UserId;
      const metadata = hasher.createTokenMetadata(token, userId, 24);

      expect(metadata.hashedToken).toBeDefined();
      expect(metadata.userId).toBe(userId);
      expect(metadata.createdAt).toBe(token.createdAt);
      expect(metadata.expiresAt).toBeDefined();
      expect(metadata.isRevoked).toBe(false);
    });

    it('should create metadata without expiration when not specified', () => {
      const token = generator.generateToken();
      const userId = 'user123' as UserId;
      const metadata = hasher.createTokenMetadata(token, userId);

      expect(metadata.expiresAt).toBeUndefined();
    });
  });

  describe('token expiration and revocation checks', () => {
    it('should detect expired tokens', () => {
      const token = generator.generateToken();
      const userId = 'user123' as UserId;
      const metadata = hasher.createTokenMetadata(token, userId, 1);
      
      // Simulate time passing
      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours later
      const isExpired = hasher.isTokenExpired(metadata, futureTime);

      expect(isExpired).toBe(true);
    });

    it('should detect non-expired tokens', () => {
      const token = generator.generateToken();
      const userId = 'user123' as UserId;
      const metadata = hasher.createTokenMetadata(token, userId, 24);
      
      const isExpired = hasher.isTokenExpired(metadata);

      expect(isExpired).toBe(false);
    });

    it('should detect revoked tokens', () => {
      const token = generator.generateToken();
      const userId = 'user123' as UserId;
      const metadata = hasher.createTokenMetadata(token, userId);
      const revokedMetadata = { ...metadata, isRevoked: true };
      
      const isRevoked = hasher.isTokenRevoked(revokedMetadata);

      expect(isRevoked).toBe(true);
    });
  });
});