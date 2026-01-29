/**
 * WebRTC Module Tests
 * Basic tests for WebRTC communication engine components
 */

import { webrtcEngine } from './webrtcEngine';
import { callSessionManager } from './callSessionManager';
import { iceServerManager } from './iceServerManager';
import { encryptionManager } from './encryptionManager';
import { certificateValidator } from './certificateValidator';
import { connectionSecurityManager } from './connectionSecurity';
import { AnonymousSessionId, CallStatus, AnonymousId } from './types';

describe('WebRTC Communication Engine', () => {
  beforeEach(() => {
    // Reset any state between tests
  });

  afterEach(async () => {
    // Cleanup after each test
    await callSessionManager.shutdown();
  });

  describe('ICE Server Manager', () => {
    test('should provide ICE server configuration', () => {
      const config = iceServerManager.getICEServerConfig();
      
      expect(config).toBeDefined();
      expect(config.stunServers).toBeDefined();
      expect(config.stunServers.length).toBeGreaterThan(0);
      expect(config.stunServers[0].urls).toBeDefined();
      expect(config.stunServers[0].urls.length).toBeGreaterThan(0);
    });

    test('should generate TURN credentials', () => {
      const sessionId = 'test-session';
      const credentials = iceServerManager.generateTURNCredentials(sessionId);
      
      expect(credentials).toBeDefined();
      expect(credentials.username).toBeDefined();
      expect(credentials.credential).toBeDefined();
      expect(credentials.username).toContain(sessionId);
    });
  });

  describe('Encryption Manager', () => {
    test('should generate encryption configuration', async () => {
      const sessionId = 'test-session' as AnonymousSessionId;
      
      const encryptionInfo = await encryptionManager.generateEncryptionConfig(sessionId);
      
      expect(encryptionInfo).toBeDefined();
      expect(encryptionInfo.dtls).toBeDefined();
      expect(encryptionInfo.srtp).toBeDefined();
      expect(encryptionInfo.keys).toBeDefined();
      expect(encryptionInfo.dtls.fingerprint).toBeDefined();
      expect(encryptionInfo.srtp.cryptoSuite).toBeDefined();
      expect(encryptionInfo.keys.masterKey).toBeDefined();
      expect(encryptionInfo.keys.masterSalt).toBeDefined();
    });

    test('should validate encryption strength', async () => {
      const sessionId = 'test-session' as AnonymousSessionId;
      const encryptionInfo = await encryptionManager.generateEncryptionConfig(sessionId);
      
      const isValid = encryptionManager.validateEncryptionStrength(encryptionInfo);
      
      expect(isValid).toBe(true);
    });

    test('should cleanup session data', async () => {
      const sessionId = 'test-session' as AnonymousSessionId;
      await encryptionManager.generateEncryptionConfig(sessionId);
      
      const keysBefore = encryptionManager.getEncryptionKeys(sessionId);
      expect(keysBefore).toBeDefined();
      
      encryptionManager.cleanupSession(sessionId);
      
      const keysAfter = encryptionManager.getEncryptionKeys(sessionId);
      expect(keysAfter).toBeUndefined();
    });
  });

  describe('Certificate Validator', () => {
    test('should generate certificate fingerprint', () => {
      const certificateData = Buffer.from('test-certificate-data');
      
      const fingerprint = certificateValidator.generateFingerprint(certificateData);
      
      expect(fingerprint).toBeDefined();
      expect(fingerprint).toMatch(/^[0-9A-F:]+$/); // Should be hex with colons
    });

    test('should validate DTLS fingerprint', async () => {
      const certificateData = Buffer.from('test-certificate-data');
      const fingerprint = certificateValidator.generateFingerprint(certificateData);
      
      // Mock certificate info
      const certificateInfo = {
        subject: 'CN=test',
        issuer: 'CN=test',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        fingerprint,
        algorithm: 'sha-256',
        keyUsage: ['digitalSignature'],
        extendedKeyUsage: ['serverAuth']
      };
      
      const isValid = certificateValidator.validateDTLSFingerprint(
        certificateInfo,
        fingerprint,
        'sha-256'
      );
      
      expect(isValid).toBe(true);
    });
  });

  describe('Connection Security Manager', () => {
    test('should validate connection security', async () => {
      const sessionId = 'test-session' as AnonymousSessionId;
      
      const securityInfo = await connectionSecurityManager.validateConnectionSecurity(
        sessionId,
        {
          tlsVersion: 'TLSv1.3',
          cipherSuite: 'TLS_AES_256_GCM_SHA384',
          remoteAddress: '127.0.0.1'
        }
      );
      
      expect(securityInfo).toBeDefined();
      expect(securityInfo.sessionId).toBe(sessionId);
      expect(securityInfo.tlsVersion).toBe('TLSv1.3');
      expect(securityInfo.cipherSuite).toBe('TLS_AES_256_GCM_SHA384');
      expect(securityInfo.encryptionStrength).toBe('strong');
      expect(securityInfo.securityLevel).toBeGreaterThan(70);
    });

    test('should detect weak connections', async () => {
      const sessionId = 'test-session' as AnonymousSessionId;
      
      const securityInfo = await connectionSecurityManager.validateConnectionSecurity(
        sessionId,
        {
          tlsVersion: 'TLSv1.0',
          cipherSuite: 'RC4-MD5',
          remoteAddress: '127.0.0.1'
        }
      );
      
      expect(securityInfo.errors.length).toBeGreaterThan(0);
      expect(securityInfo.encryptionStrength).toBe('weak');
      expect(securityInfo.securityLevel).toBeLessThan(50);
    });
  });

  describe('Call Session Manager', () => {
    test('should create anonymous call session', async () => {
      const participantA = 'participant-a' as AnonymousId;
      const participantB = 'participant-b' as AnonymousId;
      
      const session = await callSessionManager.createSession(participantA, participantB);
      
      expect(session).toBeDefined();
      expect(session.sessionId).toBeDefined();
      expect(session.status).toBe(CallStatus.INITIATING);
      expect(session.participantA).toBe(participantA);
      expect(session.participantB).toBe(participantB);
      expect(session.encryptionInfo).toBeDefined();
      expect(session.createdAt).toBeDefined();
    });

    test('should update session status', async () => {
      const participantA = 'participant-a' as AnonymousId;
      const participantB = 'participant-b' as AnonymousId;
      
      const session = await callSessionManager.createSession(participantA, participantB);
      
      await callSessionManager.updateSessionStatus(session.sessionId, CallStatus.CONNECTED);
      
      const updatedSession = callSessionManager.getSession(session.sessionId);
      expect(updatedSession?.status).toBe(CallStatus.CONNECTED);
    });

    test('should get session participants', async () => {
      const participantA = 'participant-a' as AnonymousId;
      const participantB = 'participant-b' as AnonymousId;
      
      const session = await callSessionManager.createSession(participantA, participantB);
      
      const participants = callSessionManager.getSessionParticipants(session.sessionId);
      
      expect(participants).toHaveLength(2);
      expect(participants).toContain(participantA);
      expect(participants).toContain(participantB);
    });

    test('should end session with cleanup', async () => {
      const participantA = 'participant-a' as AnonymousId;
      const participantB = 'participant-b' as AnonymousId;
      
      const session = await callSessionManager.createSession(participantA, participantB);
      
      await callSessionManager.endSession(session.sessionId, 'Test ended');
      
      const endedSession = callSessionManager.getSession(session.sessionId);
      expect(endedSession).toBeUndefined();
    });

    test('should provide session statistics', async () => {
      const participantA = 'participant-a' as AnonymousId;
      const participantB = 'participant-b' as AnonymousId;
      
      await callSessionManager.createSession(participantA, participantB);
      
      const stats = callSessionManager.getSessionStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.activeSessions).toBe(1);
      expect(stats.totalParticipants).toBe(2);
      expect(stats.sessionsByStatus).toBeDefined();
    });
  });

  describe('WebRTC Engine Integration', () => {
    test('should initialize WebRTC engine', async () => {
      // This test would require actual WebRTC infrastructure
      // For now, we'll just test that the engine can be created
      expect(webrtcEngine).toBeDefined();
      expect(typeof webrtcEngine.initializeCall).toBe('function');
      expect(typeof webrtcEngine.handleIncomingCall).toBe('function');
      expect(typeof webrtcEngine.endCall).toBe('function');
      expect(typeof webrtcEngine.getCallStatus).toBe('function');
    });

    test('should handle call status queries', () => {
      const sessionId = 'non-existent-session' as AnonymousSessionId;
      
      const status = webrtcEngine.getCallStatus(sessionId);
      
      expect(status).toBe(CallStatus.ENDED);
    });
  });
});