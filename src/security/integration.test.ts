/**
 * Security Integration Tests
 * 
 * Integration tests demonstrating the complete token lifecycle
 * from generation to validation and storage.
 */

import { TokenManager, TokenManagerFactory } from './tokenManager';
import { InMemoryTokenStorage } from './tokenStorage';
import { UserId } from './types';

describe('Security Integration', () => {
  let tokenManager: TokenManager;
  let storage: InMemoryTokenStorage;

  beforeEach(() => {
    storage = new InMemoryTokenStorage();
    tokenManager = TokenManagerFactory.create(storage);
  });

  it('should complete full token lifecycle', async () => {
    const userId = 'user123' as UserId;

    // 1. Generate token for user
    const token = await tokenManager.generateToken(userId);
    expect(token).toBeDefined();
    expect(token.value.length).toBe(64);

    // 2. Format token for QR code
    const qrData = tokenManager.formatTokenForQR(token);
    expect(qrData).toContain('pqc:');

    // 3. Extract token from QR data
    const extractedToken = tokenManager.extractTokenFromQR(qrData);
    expect(extractedToken).toBeDefined();
    expect(extractedToken!.value).toBe(token.value);

    // 4. Validate token
    const validationResult = await tokenManager.validateToken(qrData);
    expect(validationResult.isValid).toBe(true);

    // 5. Resolve token to user
    const resolvedUserId = await tokenManager.resolveTokenToUser(token);
    expect(resolvedUserId).toBe(userId);

    // 6. Get user tokens
    const userTokens = await tokenManager.getUserTokens(userId);
    expect(userTokens).toHaveLength(1);

    // 7. Revoke token
    const revoked = await tokenManager.revokeToken(token);
    expect(revoked).toBe(true);

    // 8. Verify token is no longer valid after revocation
    const validTokensAfterRevoke = await tokenManager.getUserTokens(userId);
    expect(validTokensAfterRevoke).toHaveLength(0);
  });

  it('should handle multiple tokens per user', async () => {
    const userId = 'user456' as UserId;

    // Generate multiple tokens
    const token1 = await tokenManager.generateToken(userId);
    const token2 = await tokenManager.generateToken(userId);
    const token3 = await tokenManager.generateToken(userId);

    // All should be valid
    const userTokens = await tokenManager.getUserTokens(userId);
    expect(userTokens).toHaveLength(3);

    // Revoke all tokens
    const revokedCount = await tokenManager.revokeAllUserTokens(userId);
    expect(revokedCount).toBe(3);

    // No valid tokens should remain
    const remainingTokens = await tokenManager.getUserTokens(userId);
    expect(remainingTokens).toHaveLength(0);
  });

  it('should enforce token limits per user', async () => {
    const userId = 'user789' as UserId;
    const limitedStorage = new InMemoryTokenStorage();
    const limitedManager = TokenManagerFactory.create(limitedStorage, {
      maxTokensPerUser: 2
    });

    // Generate tokens up to limit
    await limitedManager.generateToken(userId);
    await limitedManager.generateToken(userId);
    
    let userTokens = await limitedManager.getUserTokens(userId);
    expect(userTokens).toHaveLength(2);

    // Generate one more - should revoke oldest
    await limitedManager.generateToken(userId);
    
    userTokens = await limitedManager.getUserTokens(userId);
    expect(userTokens).toHaveLength(2); // Still only 2 tokens
  });

  it('should clean up expired tokens', async () => {
    const userId = 'user999' as UserId;
    const shortExpiryStorage = new InMemoryTokenStorage();
    const shortExpiryManager = TokenManagerFactory.create(shortExpiryStorage, {
      defaultExpirationHours: 0.001 // Very short expiry for testing
    });

    // Generate token with short expiry
    await shortExpiryManager.generateToken(userId);
    
    let userTokens = await shortExpiryManager.getUserTokens(userId);
    expect(userTokens).toHaveLength(1);

    // Wait a bit and clean up
    await new Promise(resolve => setTimeout(resolve, 10));
    const cleanedCount = await shortExpiryManager.cleanupExpiredTokens();
    expect(cleanedCount).toBe(1);

    // No tokens should remain
    userTokens = await shortExpiryManager.getUserTokens(userId);
    expect(userTokens).toHaveLength(0);
  });
});