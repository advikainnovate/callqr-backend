/**
 * Property-based tests for core type utilities
 * Feature: privacy-qr-calling, Property 1: Secure Token Generation and Uniqueness
 * 
 * These tests verify that type guards and utility functions maintain
 * security and privacy properties across all possible inputs.
 */

import * as fc from 'fast-check';
import { 
  isUserId, 
  isSecureToken, 
  isAnonymousId, 
  isAnonymousSessionId,
  UserId,
  SecureToken,
  AnonymousId,
  AnonymousSessionId
} from './types';

describe('Type Guards Property Tests', () => {
  describe('isUserId', () => {
    it('should accept any non-empty string as UserId', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1 }),
        (str) => {
          expect(isUserId(str)).toBe(true);
        }
      ), { numRuns: 100 });
    });

    it('should reject empty strings', () => {
      expect(isUserId('')).toBe(false);
    });

    it('should reject non-string values', () => {
      fc.assert(fc.property(
        fc.oneof(fc.integer(), fc.boolean(), fc.object(), fc.constantFrom(null, undefined)),
        (value) => {
          expect(isUserId(value as any)).toBe(false);
        }
      ), { numRuns: 100 });
    });
  });

  describe('isSecureToken', () => {
    it('should accept strings with minimum secure length', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 32 }),
        (str) => {
          expect(isSecureToken(str)).toBe(true);
        }
      ), { numRuns: 100 });
    });

    it('should reject strings shorter than minimum secure length', () => {
      fc.assert(fc.property(
        fc.string({ maxLength: 31 }),
        (str) => {
          expect(isSecureToken(str)).toBe(false);
        }
      ), { numRuns: 100 });
    });

    it('should reject non-string values', () => {
      fc.assert(fc.property(
        fc.oneof(fc.integer(), fc.boolean(), fc.object(), fc.constantFrom(null, undefined)),
        (value) => {
          expect(isSecureToken(value as any)).toBe(false);
        }
      ), { numRuns: 100 });
    });
  });

  describe('isAnonymousId', () => {
    it('should accept strings starting with anon_ prefix', () => {
      fc.assert(fc.property(
        fc.string(),
        (suffix) => {
          const anonymousId = `anon_${suffix}`;
          expect(isAnonymousId(anonymousId)).toBe(true);
        }
      ), { numRuns: 100 });
    });

    it('should reject strings not starting with anon_ prefix', () => {
      fc.assert(fc.property(
        fc.string().filter(s => !s.startsWith('anon_')),
        (str) => {
          expect(isAnonymousId(str)).toBe(false);
        }
      ), { numRuns: 100 });
    });
  });

  describe('isAnonymousSessionId', () => {
    it('should accept strings starting with session_ prefix', () => {
      fc.assert(fc.property(
        fc.string(),
        (suffix) => {
          const sessionId = `session_${suffix}`;
          expect(isAnonymousSessionId(sessionId)).toBe(true);
        }
      ), { numRuns: 100 });
    });

    it('should reject strings not starting with session_ prefix', () => {
      fc.assert(fc.property(
        fc.string().filter(s => !s.startsWith('session_')),
        (str) => {
          expect(isAnonymousSessionId(str)).toBe(false);
        }
      ), { numRuns: 100 });
    });
  });

  describe('Type safety properties', () => {
    it('should maintain type safety for branded types', () => {
      // This test verifies that our branded types provide compile-time safety
      // while still being compatible with string operations at runtime
      
      fc.assert(fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 32 }),
        fc.string(),
        fc.string(),
        (userStr, tokenStr, anonStr, sessionStr) => {
          // Type guards should work correctly
          if (isUserId(userStr)) {
            const userId: UserId = userStr;
            expect(typeof userId).toBe('string');
          }
          
          if (isSecureToken(tokenStr)) {
            const token: SecureToken = tokenStr;
            expect(typeof token).toBe('string');
            expect(token.length).toBeGreaterThanOrEqual(32);
          }
          
          const anonymousId = `anon_${anonStr}` as AnonymousId;
          expect(isAnonymousId(anonymousId)).toBe(true);
          
          const sessionId = `session_${sessionStr}` as AnonymousSessionId;
          expect(isAnonymousSessionId(sessionId)).toBe(true);
        }
      ), { numRuns: 100 });
    });
  });
});