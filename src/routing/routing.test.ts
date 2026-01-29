/**
 * Routing Integration Tests
 * 
 * Tests the privacy-preserving call routing system components.
 */

import { RoutingService } from './routingService';
import { TokenProcessingRequest } from './tokenProcessor';
import { UserId } from '../security/types';

describe('Privacy-Preserving Call Routing System', () => {
  let routingService: RoutingService;

  beforeEach(() => {
    routingService = new RoutingService({
      enableRateLimiting: true,
      enableAbuseDetection: true,
      enableLogging: false
    });
  });

  afterEach(() => {
    routingService.shutdown();
  });

  describe('Token Generation and Processing Flow', () => {
    it('should generate token and process it without local caching', async () => {
      // Generate a token for a user
      const userId = 'user123' as UserId;
      const tokenManager = routingService.getTokenManager();
      const token = await tokenManager.generateToken(userId);

      expect(token).toBeDefined();
      expect(token.value).toBeDefined();
      expect(token.version).toBe(1);
      expect(token.checksum).toBeDefined();

      // Process the token through the routing system
      const tokenProcessor = routingService.getTokenProcessor();
      const processingRequest: TokenProcessingRequest = {
        token,
        clientId: 'test-client-123',
        ipAddress: '192.168.1.100'
      };

      const result = await tokenProcessor.processToken(processingRequest);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.callerAnonymousId).toBeDefined();
      expect(result.calleeAnonymousId).toBeDefined();
    });

    it('should enforce rate limiting', async () => {
      const userId = 'user456' as UserId;
      const tokenManager = routingService.getTokenManager();
      const token = await tokenManager.generateToken(userId);

      const tokenProcessor = routingService.getTokenProcessor();
      const processingRequest: TokenProcessingRequest = {
        token,
        clientId: 'rate-limited-client',
        ipAddress: '192.168.1.200'
      };

      // Make multiple requests rapidly
      const results = [];
      for (let i = 0; i < 15; i++) {
        const result = await tokenProcessor.processToken(processingRequest);
        results.push(result);
      }

      // Some requests should be rate limited
      const rateLimitedResults = results.filter(r => !r.success && r.error === 'RATE_LIMITED');
      expect(rateLimitedResults.length).toBeGreaterThan(0);
    });
  });

  describe('Privacy Layer', () => {
    it('should generate anonymous IDs', () => {
      const privacyLayer = routingService.getPrivacyLayer();
      
      const anonymousId1 = privacyLayer.generateAnonymousId();
      const anonymousId2 = privacyLayer.generateAnonymousId();

      expect(anonymousId1).toMatch(/^anon_[a-f0-9]+$/);
      expect(anonymousId2).toMatch(/^anon_[a-f0-9]+$/);
      expect(anonymousId1).not.toBe(anonymousId2);
    });

    it('should validate privacy compliance', () => {
      const privacyLayer = routingService.getPrivacyLayer();
      
      // Test with privacy-compliant data
      const compliantData = 'anon_abc123';
      const compliantResult = privacyLayer.validatePrivacyCompliance(compliantData);
      expect(compliantResult.compliant).toBe(true);

      // Test with privacy-violating data
      const violatingData = 'user@example.com';
      const violatingResult = privacyLayer.validatePrivacyCompliance(violatingData);
      expect(violatingResult.compliant).toBe(false);
      expect(violatingResult.violations.length).toBeGreaterThan(0);
    });

    it('should sanitize log data', () => {
      const privacyLayer = routingService.getPrivacyLayer();
      
      const logEntry = {
        message: 'User john@example.com called 555-123-4567',
        userId: 'user123',
        timestamp: new Date()
      };

      const sanitized = privacyLayer.sanitizeLogData(logEntry);
      
      expect(sanitized.message).not.toContain('john@example.com');
      expect(sanitized.message).not.toContain('555-123-4567');
      expect(sanitized.userId).toBe('[REDACTED]');
    });
  });

  describe('Session Management', () => {
    it('should create and manage anonymous sessions', async () => {
      const privacyLayer = routingService.getPrivacyLayer();
      const sessionManager = routingService.getSessionManager();

      const callerId = privacyLayer.generateAnonymousId();
      const calleeId = privacyLayer.generateAnonymousId();

      const sessionResult = await sessionManager.createAnonymousSession({
        callerId,
        calleeId
      });

      expect(sessionResult.success).toBe(true);
      expect(sessionResult.sessionId).toBeDefined();

      // Verify session exists
      const session = sessionManager.getSession(sessionResult.sessionId!);
      expect(session.found).toBe(true);
      expect(session.session?.participantA).toBe(callerId);
      expect(session.session?.participantB).toBe(calleeId);
    });

    it('should prevent duplicate sessions', async () => {
      const privacyLayer = routingService.getPrivacyLayer();
      const sessionManager = routingService.getSessionManager();

      const callerId = privacyLayer.generateAnonymousId();
      const calleeId = privacyLayer.generateAnonymousId();

      // Create first session
      const firstResult = await sessionManager.createAnonymousSession({
        callerId,
        calleeId
      });
      expect(firstResult.success).toBe(true);

      // Try to create duplicate session
      const duplicateResult = await sessionManager.createAnonymousSession({
        callerId,
        calleeId
      });
      expect(duplicateResult.success).toBe(false);
      expect(duplicateResult.error).toBe('DUPLICATE_SESSION');
    });
  });

  describe('Call Router', () => {
    it('should route calls with privacy protection', async () => {
      const userId1 = 'caller123' as UserId;
      const userId2 = 'callee456' as UserId;
      
      const callRouter = routingService.getCallRouter();
      
      const routingResult = await callRouter.routeCall(userId1, userId2);
      
      expect(routingResult.success).toBe(true);
      expect(routingResult.sessionId).toBeDefined();
      expect(routingResult.callerAnonymousId).toMatch(/^anon_/);
      expect(routingResult.calleeAnonymousId).toMatch(/^anon_/);
      expect(routingResult.callerAnonymousId).not.toBe(routingResult.calleeAnonymousId);
    });
  });
});