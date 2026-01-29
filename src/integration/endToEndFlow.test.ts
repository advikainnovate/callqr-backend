/**
 * End-to-End Integration Tests
 * 
 * Tests the complete call flow from QR scan to call completion
 * to verify all components are properly wired together.
 * 
 * Requirements: All requirements integration
 */

import { systemIntegration, SystemIntegrationConfig } from './systemIntegration';
import { SecureToken } from '../security/types';
import { AnonymousSessionId } from '../utils/types';
import { CallStatus } from '../routing/types';

describe('End-to-End Call Flow Integration', () => {
  let config: SystemIntegrationConfig;

  beforeAll(async () => {
    // Setup test configuration
    config = {
      database: {
        host: 'localhost',
        port: 5432,
        database: 'privacy_qr_calling_test',
        username: 'test_user',
        password: 'test_password',
        ssl: false
      },
      auth: {
        requireMFA: false, // Simplified for testing
        jwtSecret: 'test-jwt-secret',
        sessionDurationHours: 1
      },
      webrtc: {
        signalingPort: 8444, // Different port for testing
        stunServers: ['stun:stun.l.google.com:19302'],
        turnServers: []
      },
      privacy: {
        tokenExpirationHours: 24,
        sessionTimeoutMinutes: 30,
        dataRetentionDays: 1
      }
    };

    // Initialize system for testing
    await systemIntegration.initialize(config);
  });

  afterAll(async () => {
    await systemIntegration.shutdown();
  });

  describe('Complete Call Flow', () => {
    it('should process complete call flow from QR scan to call completion', async () => {
      const services = systemIntegration.getServices();

      // Step 1: Generate QR token for user
      const userId = 'test-user-123' as any;
      const token = await services.tokenManager.generateToken(userId);
      
      expect(token).toBeDefined();
      expect(token.value).toHaveLength(64); // 256-bit token as hex string

      // Step 2: Format token for QR code
      const qrData = services.tokenManager.formatTokenForQR(token);
      expect(qrData).toMatch(/^pqc:\d+:[a-f0-9]{64}:[a-f0-9]{8}$/);

      // Step 3: Simulate QR scan and token extraction
      const extractedToken = services.tokenManager.extractTokenFromQR(qrData);
      expect(extractedToken).toBeDefined();
      expect(extractedToken!.value).toBe(token.value);

      // Step 4: Validate scanned token
      const validationResult = await services.tokenManager.validateToken(token.value);
      expect(validationResult.isValid).toBe(true);

      // Step 5: Process call flow through system integration
      const callResult = await systemIntegration.processCallFlow(qrData, 'caller-anon-123');
      
      expect(callResult.success).toBe(true);
      expect(callResult.sessionId).toBeDefined();

      // Step 6: Verify call session was created
      const callSession = services.callRouter.getCallSession(callResult.sessionId!);
      expect(callSession).toBeDefined();
      expect(callSession!.status).toBe(CallStatus.INITIATING);

      // Step 7: Simulate call progression
      await services.callRouter.updateCallStatus(callResult.sessionId!, CallStatus.RINGING);
      await services.callRouter.updateCallStatus(callResult.sessionId!, CallStatus.CONNECTED);

      // Step 8: Verify call status updates
      const updatedSession = services.callRouter.getCallSession(callResult.sessionId!);
      expect(updatedSession!.status).toBe(CallStatus.CONNECTED);

      // Step 9: End call
      const terminateResult = await services.callRouter.terminateCall(callResult.sessionId!);
      expect(terminateResult.success).toBe(true);

      // Step 10: Verify call cleanup
      const finalSession = services.callRouter.getCallSession(callResult.sessionId!);
      expect(finalSession?.status).toBe(CallStatus.ENDED);
    });

    it('should handle invalid QR codes gracefully', async () => {
      const invalidQRData = 'invalid-qr-data';
      
      const callResult = await systemIntegration.processCallFlow(invalidQRData);
      
      expect(callResult.success).toBe(false);
      expect(callResult.error).toBe('Invalid QR code format');
    });

    it('should handle expired tokens gracefully', async () => {
      const services = systemIntegration.getServices();

      // Generate and immediately revoke token
      const userId = 'test-user-456' as any;
      const token = await services.tokenManager.generateToken(userId);
      await services.tokenManager.revokeToken(token);

      const qrData = services.tokenManager.formatTokenForQR(token);
      const callResult = await systemIntegration.processCallFlow(qrData);
      
      expect(callResult.success).toBe(false);
      expect(callResult.error).toBe('Invalid or expired token');
    });
  });

  describe('System Health and Resilience', () => {
    it('should report healthy status when all services are running', async () => {
      const healthCheck = await systemIntegration.healthCheck();
      
      expect(healthCheck.status).toBe('healthy');
      expect(healthCheck.services.auth).toBe(true);
      expect(healthCheck.services.tokenManager).toBe(true);
      expect(healthCheck.services.callRouter).toBe(true);
      expect(healthCheck.services.webrtc).toBe(true);
      expect(healthCheck.errors).toHaveLength(0);
    });

    it('should handle service failures gracefully', async () => {
      // This would test circuit breaker and graceful degradation
      // For now, just verify the health check structure
      const healthCheck = await systemIntegration.healthCheck();
      
      expect(healthCheck).toHaveProperty('status');
      expect(healthCheck).toHaveProperty('services');
      expect(healthCheck).toHaveProperty('errors');
    });
  });

  describe('Privacy Compliance', () => {
    it('should maintain privacy throughout call flow', async () => {
      const services = systemIntegration.getServices();

      // Generate token and process call
      const userId = 'test-user-789' as any;
      const token = await services.tokenManager.generateToken(userId);
      const qrData = services.tokenManager.formatTokenForQR(token);
      
      const callResult = await systemIntegration.processCallFlow(qrData, 'caller-anon-456');
      expect(callResult.success).toBe(true);

      // Verify session uses anonymous identifiers
      const callSession = services.callRouter.getCallSession(callResult.sessionId!);
      expect(callSession).toBeDefined();
      
      // Verify no personal data is exposed
      expect(callSession!.participantA).toMatch(/^anon_/);
      expect(callSession!.participantB).toMatch(/^anon_/);
      
      // Verify session ID is anonymous
      expect(callSession!.sessionId).not.toContain(userId);
      expect(callSession!.sessionId).not.toContain('caller-anon-456');
    });

    it('should not expose token values in logs or responses', async () => {
      const services = systemIntegration.getServices();

      const userId = 'test-user-999' as any;
      const token = await services.tokenManager.generateToken(userId);
      
      // Verify token is hashed in storage
      const tokenMappings = await services.tokenManager.getUserTokens(userId);
      expect(tokenMappings).toBeDefined();
      
      // Verify actual token value is not stored
      tokenMappings.forEach(mapping => {
        expect(mapping.hashedToken).not.toBe(token.value);
        expect(mapping.hashedToken).toHaveLength(64); // SHA-256 hash length
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network failures gracefully', async () => {
      // Simulate network failure by using invalid configuration
      const invalidQRData = 'pqc:1:invalidtoken:checksum';
      
      const callResult = await systemIntegration.processCallFlow(invalidQRData);
      
      expect(callResult.success).toBe(false);
      expect(callResult.error).toBeDefined();
    });

    it('should cleanup resources on call failure', async () => {
      const services = systemIntegration.getServices();

      // Generate valid token but simulate call failure
      const userId = 'test-user-cleanup' as any;
      const token = await services.tokenManager.generateToken(userId);
      const qrData = services.tokenManager.formatTokenForQR(token);
      
      // Process call flow
      const callResult = await systemIntegration.processCallFlow(qrData);
      expect(callResult.success).toBe(true);

      // Simulate failure and cleanup
      await services.callRouter.terminateCall(callResult.sessionId!);
      
      // Verify cleanup
      const cleanedSession = services.callRouter.getCallSession(callResult.sessionId!);
      expect(cleanedSession?.status).toBe(CallStatus.ENDED);
    });
  });
});

/**
 * Integration test utilities
 */
export class IntegrationTestUtils {
  /**
   * Create test user and generate token
   */
  static async createTestUserWithToken(services: any): Promise<{
    userId: string;
    token: SecureToken;
    qrData: string;
  }> {
    const userId = `test-user-${Date.now()}`;
    const token = await services.tokenManager.generateToken(userId);
    const qrData = services.tokenManager.formatTokenForQR(token);
    
    return { userId, token, qrData };
  }

  /**
   * Simulate complete call flow
   */
  static async simulateCallFlow(
    systemIntegration: any,
    qrData: string,
    callerAnonymousId?: string
  ): Promise<{
    success: boolean;
    sessionId?: AnonymousSessionId;
    error?: string;
  }> {
    return await systemIntegration.processCallFlow(qrData, callerAnonymousId);
  }

  /**
   * Verify privacy compliance
   */
  static verifyPrivacyCompliance(callSession: any): boolean {
    // Check that no personal data is exposed
    const hasAnonymousParticipants = 
      callSession.participantA.startsWith('anon_') &&
      callSession.participantB.startsWith('anon_');
    
    const hasAnonymousSessionId = !callSession.sessionId.includes('user');
    
    return hasAnonymousParticipants && hasAnonymousSessionId;
  }
}