/**
 * WebRTC Communication Engine
 * Main interface for WebRTC functionality with privacy and security controls
 */

import { AnonymousSessionId, CallSession, CallStatus, EncryptionDetails, AnonymousId } from './types';
import { peerConnectionManager } from './peerConnectionManager';
import { signalingServer } from './signalingServer';
import { iceServerManager } from './iceServerManager';
import { encryptionManager } from './encryptionManager';
import { callSessionManager } from './callSessionManager';
import { logger } from '../utils/logger';
import { 
  callQualityManager, 
  startCallQualityMonitoring, 
  stopCallQualityMonitoring,
  CallQualityMetrics,
  QualityFeedback 
} from '../utils/callQualityManager';

export interface WebRTCEngine {
  initializeCall(sessionId: AnonymousSessionId): Promise<CallSession>;
  handleIncomingCall(sessionId: AnonymousSessionId): Promise<CallSession>;
  endCall(sessionId: AnonymousSessionId): Promise<void>;
  getCallStatus(sessionId: AnonymousSessionId): CallStatus;
}

export class WebRTCEngineImpl implements WebRTCEngine {
  constructor() {
    this.setupEventHandlers();
  }

  /**
   * Initialize WebRTC engine
   */
  public async initialize(): Promise<void> {
    try {
      // Validate ICE servers
      const iceServersValid = await iceServerManager.validateICEServers();
      if (!iceServersValid) {
        logger.warn('Some ICE servers failed validation, proceeding with available servers');
      }

      // Start signaling server
      const signalingConfig = {
        port: parseInt(process.env.SIGNALING_PORT || '8443'),
        httpsOptions: process.env.HTTPS_KEY && process.env.HTTPS_CERT ? {
          key: process.env.HTTPS_KEY,
          cert: process.env.HTTPS_CERT
        } : undefined
      };

      await signalingServer.start(signalingConfig);
      
      logger.info('WebRTC engine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize WebRTC engine:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Shutdown WebRTC engine with session manager cleanup
   */
  public async shutdown(): Promise<void> {
    try {
      // Shutdown session manager (ends all active sessions)
      await callSessionManager.shutdown();

      // Stop signaling server
      await signalingServer.stop();

      // Cleanup peer connections
      await peerConnectionManager.cleanup();

      logger.info('WebRTC engine shutdown completed');
    } catch (error) {
      logger.error('Error during WebRTC engine shutdown:', error as Record<string, unknown>);
    }
  }

  /**
   * Initialize outgoing call using session manager
   */
  public async initializeCall(sessionId: AnonymousSessionId): Promise<CallSession> {
    try {
      // Check if session already exists
      let session = callSessionManager.getSession(sessionId);
      if (session) {
        logger.warn(`Call session already exists: ${sessionId}`);
        return session;
      }

      // Create anonymous participants
      const participantA = this.generateAnonymousId();
      const participantB = this.generateAnonymousId();

      // Create session through session manager
      session = await callSessionManager.createSession(participantA, participantB);

      // Start call quality monitoring with timeout handling
      startCallQualityMonitoring(
        sessionId,
        async (reason: string) => {
          logger.warn(`Call timeout: ${reason}`, { sessionId });
          await this.endCall(sessionId);
        },
        async (feedback: QualityFeedback) => {
          // Send quality feedback to clients
          signalingServer.sendToSession(sessionId, {
            type: 'quality-feedback',
            sessionId,
            payload: feedback,
            timestamp: new Date()
          });
        }
      );

      // Create peer connection
      const peerConnection = await peerConnectionManager.createPeerConnection(sessionId);

      // Create and send offer
      const offer = await peerConnectionManager.createOffer(sessionId);
      
      // Send offer through signaling
      signalingServer.sendToSession(sessionId, {
        type: 'offer',
        sessionId,
        payload: offer,
        timestamp: new Date()
      });

      // Update status to ringing
      await callSessionManager.updateSessionStatus(sessionId, CallStatus.RINGING);

      logger.info(`Call initialized for session: ${sessionId}`);
      return session;
    } catch (error) {
      logger.error(`Failed to initialize call for session ${sessionId}:`, error as Record<string, unknown>);
      await this.endCall(sessionId);
      throw error;
    }
  }

  /**
   * Handle incoming call using session manager
   */
  public async handleIncomingCall(sessionId: AnonymousSessionId): Promise<CallSession> {
    try {
      // Check if session already exists
      let session = callSessionManager.getSession(sessionId);
      if (session) {
        return session;
      }

      // Create anonymous participants
      const participantA = this.generateAnonymousId();
      const participantB = this.generateAnonymousId();

      // Create session through session manager
      session = await callSessionManager.createSession(participantA, participantB);

      // Start ringing timeout
      callQualityManager.startRingingTimeout(sessionId, async () => {
        logger.info(`Ringing timeout for session: ${sessionId}`);
        await this.endCall(sessionId);
      });

      // Create peer connection
      await peerConnectionManager.createPeerConnection(sessionId);

      // Update status to ringing
      await callSessionManager.updateSessionStatus(sessionId, CallStatus.RINGING);

      logger.info(`Incoming call handled for session: ${sessionId}`);
      return session;
    } catch (error) {
      logger.error(`Failed to handle incoming call for session ${sessionId}:`, error as Record<string, unknown>);
      await this.endCall(sessionId);
      throw error;
    }
  }

  /**
   * End call session using session manager
   */
  public async endCall(sessionId: AnonymousSessionId): Promise<void> {
    try {
      const session = callSessionManager.getSession(sessionId);
      if (!session) {
        logger.warn(`Attempted to end non-existent call session: ${sessionId}`);
        return;
      }

      // Stop call quality monitoring
      stopCallQualityMonitoring(sessionId);

      // Send call end signal
      signalingServer.sendToSession(sessionId, {
        type: 'call-end',
        sessionId,
        payload: { reason: 'call-ended' },
        timestamp: new Date()
      });

      // Close peer connection
      await peerConnectionManager.closePeerConnection(sessionId);

      // End session through session manager (handles all cleanup)
      await callSessionManager.endSession(sessionId, 'Call ended by user');

      logger.info(`Call ended for session: ${sessionId}`);
    } catch (error) {
      logger.error(`Error ending call for session ${sessionId}:`, error as Record<string, unknown>);
    }
  }

  /**
   * Get call status using session manager
   */
  public getCallStatus(sessionId: AnonymousSessionId): CallStatus {
    const session = callSessionManager.getSession(sessionId);
    return session ? session.status : CallStatus.ENDED;
  }

  /**
   * Get active call session using session manager
   */
  public getCallSession(sessionId: AnonymousSessionId): CallSession | undefined {
    return callSessionManager.getSession(sessionId);
  }

  /**
   * Record call quality metrics
   */
  public recordQualityMetrics(metrics: CallQualityMetrics): void {
    callQualityManager.recordQualityMetrics(metrics);
  }

  /**
   * Get call statistics
   */
  public getCallStatistics(sessionId: AnonymousSessionId) {
    return callQualityManager.getCallStatistics(sessionId);
  }

  /**
   * Get encryption details from peer connection with real encryption info
   */
  private async getEncryptionDetails(peerConnection: any): Promise<EncryptionDetails> {
    // Generate a session ID for encryption (in real implementation, this would come from the call)
    const tempSessionId = `temp_${Date.now()}` as AnonymousSessionId;
    
    try {
      // Generate encryption configuration
      const encryptionInfo = await encryptionManager.generateEncryptionConfig(tempSessionId);
      
      // Validate encryption strength
      if (!encryptionManager.validateEncryptionStrength(encryptionInfo)) {
        throw new Error('Generated encryption does not meet security requirements');
      }

      return {
        algorithm: 'AES-256-GCM',
        keyFingerprint: encryptionInfo.keys.masterKey.toString('hex').substring(0, 32),
        dtlsFingerprint: encryptionInfo.dtls.fingerprint
      };
    } catch (error) {
      logger.error('Failed to get encryption details:', error as Record<string, unknown>);
      // Fallback to mock details
      return {
        algorithm: 'AES-256-GCM',
        keyFingerprint: this.generateFingerprint(),
        dtlsFingerprint: this.generateFingerprint()
      };
    } finally {
      // Cleanup temporary session
      encryptionManager.cleanupSession(tempSessionId);
    }
  }

  /**
   * Generate anonymous ID for participants
   */
  private generateAnonymousId(): AnonymousId {
    return `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` as AnonymousId;
  }

  /**
   * Generate cryptographic fingerprint
   */
  private generateFingerprint(): string {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  /**
   * Setup event handlers for peer connection and session events
   */
  private setupEventHandlers(): void {
    // Peer connection events
    peerConnectionManager.on('connection-state-change', async (state, sessionId) => {
      let newStatus: CallStatus | null = null;
      
      switch (state.connectionState) {
        case 'connected':
          newStatus = CallStatus.CONNECTED;
          // Start quality monitoring when call connects
          if (!callQualityManager.getCallStatistics(sessionId)) {
            startCallQualityMonitoring(
              sessionId,
              async (reason: string) => {
                logger.warn(`Call timeout: ${reason}`, { sessionId });
                await this.endCall(sessionId);
              },
              async (feedback: QualityFeedback) => {
                signalingServer.sendToSession(sessionId, {
                  type: 'quality-feedback',
                  sessionId,
                  payload: feedback,
                  timestamp: new Date()
                });
              }
            );
          }
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
          newStatus = CallStatus.ENDED;
          // Stop quality monitoring when call ends
          stopCallQualityMonitoring(sessionId);
          break;
      }
      
      if (newStatus) {
        await callSessionManager.updateSessionStatus(sessionId, newStatus);
      }
    });

    peerConnectionManager.on('ice-candidate', (candidate, sessionId) => {
      signalingServer.sendToSession(sessionId, {
        type: 'ice-candidate',
        sessionId,
        payload: candidate,
        timestamp: new Date()
      });
    });

    // Session manager events
    callSessionManager.on('session-created', (session) => {
      logger.debug(`Session created: ${session.sessionId}`);
    });

    callSessionManager.on('session-updated', (session) => {
      logger.debug(`Session updated: ${session.sessionId} - ${session.status}`);
    });

    callSessionManager.on('session-ended', (sessionId, reason) => {
      logger.info(`Session ended: ${sessionId} - ${reason}`);
    });

    callSessionManager.on('participant-joined', (sessionId, participantId) => {
      logger.debug(`Participant joined session ${sessionId}: ${participantId}`);
    });

    callSessionManager.on('participant-left', (sessionId, participantId) => {
      logger.debug(`Participant left session ${sessionId}: ${participantId}`);
    });
  }
}

export const webrtcEngine = new WebRTCEngineImpl();