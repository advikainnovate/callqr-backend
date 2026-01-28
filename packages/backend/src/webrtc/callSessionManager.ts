/**
 * Call Session Manager
 * Manages anonymous call session lifecycle without identity exposure
 */

import { EventEmitter } from 'events';
import { AnonymousSessionId, CallSession, CallStatus, AnonymousId, EncryptionDetails } from './types';
import { encryptionManager } from './encryptionManager';
import { connectionSecurityManager } from './connectionSecurity';
import { logger } from '../utils/logger';

export interface CallSessionEvents {
  'session-created': (session: CallSession) => void;
  'session-updated': (session: CallSession) => void;
  'session-ended': (sessionId: AnonymousSessionId, reason: string) => void;
  'participant-joined': (sessionId: AnonymousSessionId, participantId: AnonymousId) => void;
  'participant-left': (sessionId: AnonymousSessionId, participantId: AnonymousId) => void;
}

export interface SessionMetrics {
  readonly sessionId: AnonymousSessionId;
  readonly duration: number; // in milliseconds
  readonly status: CallStatus;
  readonly participantCount: number;
  readonly encryptionEnabled: boolean;
  readonly securityLevel: number;
  readonly createdAt: Date;
  readonly endedAt?: Date;
}

export interface SessionCleanupPolicy {
  readonly maxSessionDuration: number; // in milliseconds
  readonly inactivityTimeout: number; // in milliseconds
  readonly maxConcurrentSessions: number;
  readonly cleanupInterval: number; // in milliseconds
}

export class CallSessionManager extends EventEmitter {
  private readonly activeSessions: Map<AnonymousSessionId, CallSession>;
  private readonly sessionMetrics: Map<AnonymousSessionId, SessionMetrics>;
  private readonly sessionParticipants: Map<AnonymousSessionId, Set<AnonymousId>>;
  private readonly participantSessions: Map<AnonymousId, AnonymousSessionId>;
  private readonly sessionActivity: Map<AnonymousSessionId, Date>;
  private readonly cleanupPolicy: SessionCleanupPolicy;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(cleanupPolicy?: Partial<SessionCleanupPolicy>) {
    super();
    
    this.activeSessions = new Map();
    this.sessionMetrics = new Map();
    this.sessionParticipants = new Map();
    this.participantSessions = new Map();
    this.sessionActivity = new Map();
    
    this.cleanupPolicy = {
      maxSessionDuration: 3600000, // 1 hour
      inactivityTimeout: 300000,   // 5 minutes
      maxConcurrentSessions: 1000,
      cleanupInterval: 60000,      // 1 minute
      ...cleanupPolicy
    };

    this.startCleanupTimer();
  }

  /**
   * Create new anonymous call session
   */
  public async createSession(
    participantA: AnonymousId,
    participantB: AnonymousId
  ): Promise<CallSession> {
    try {
      // Check concurrent session limit
      if (this.activeSessions.size >= this.cleanupPolicy.maxConcurrentSessions) {
        throw new Error('Maximum concurrent sessions reached');
      }

      // Generate anonymous session ID
      const sessionId = this.generateAnonymousSessionId();

      // Generate encryption configuration
      const encryptionInfo = await encryptionManager.generateEncryptionConfig(sessionId);

      // Create call session
      const session: CallSession = {
        sessionId,
        status: CallStatus.INITIATING,
        encryptionInfo: {
          algorithm: encryptionInfo.dtls.algorithm,
          keyFingerprint: encryptionInfo.keys.masterKey.toString('hex').substring(0, 32),
          dtlsFingerprint: encryptionInfo.dtls.fingerprint
        },
        createdAt: new Date(),
        participantA,
        participantB
      };

      // Store session data
      this.activeSessions.set(sessionId, session);
      this.sessionParticipants.set(sessionId, new Set([participantA, participantB]));
      this.participantSessions.set(participantA, sessionId);
      this.participantSessions.set(participantB, sessionId);
      this.updateSessionActivity(sessionId);

      // Initialize session metrics
      const metrics: SessionMetrics = {
        sessionId,
        duration: 0,
        status: CallStatus.INITIATING,
        participantCount: 2,
        encryptionEnabled: true,
        securityLevel: 100, // Will be updated when connection security is validated
        createdAt: new Date()
      };
      this.sessionMetrics.set(sessionId, metrics);

      // Emit session created event
      this.emit('session-created', session);

      logger.info(`Created anonymous call session: ${sessionId}`);
      return session;
    } catch (error) {
      logger.error('Failed to create call session:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Get call session by ID
   */
  public getSession(sessionId: AnonymousSessionId): CallSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get session by participant ID
   */
  public getSessionByParticipant(participantId: AnonymousId): CallSession | undefined {
    const sessionId = this.participantSessions.get(participantId);
    return sessionId ? this.activeSessions.get(sessionId) : undefined;
  }

  /**
   * Update session status
   */
  public async updateSessionStatus(
    sessionId: AnonymousSessionId,
    status: CallStatus,
    reason?: string
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      logger.warn(`Attempted to update non-existent session: ${sessionId}`);
      return;
    }

    const updatedSession: CallSession = {
      ...session,
      status
    };

    this.activeSessions.set(sessionId, updatedSession);
    this.updateSessionActivity(sessionId);

    // Update metrics
    const metrics = this.sessionMetrics.get(sessionId);
    if (metrics) {
      const updatedMetrics: SessionMetrics = {
        ...metrics,
        status,
        duration: Date.now() - metrics.createdAt.getTime()
      };
      this.sessionMetrics.set(sessionId, updatedMetrics);
    }

    // Emit session updated event
    this.emit('session-updated', updatedSession);

    logger.debug(`Updated session ${sessionId} status to ${status}${reason ? ` (${reason})` : ''}`);

    // End session if status is ENDED or FAILED
    if (status === CallStatus.ENDED || status === CallStatus.FAILED) {
      await this.endSession(sessionId, reason || 'Session ended');
    }
  }

  /**
   * Add participant to session
   */
  public async addParticipant(
    sessionId: AnonymousSessionId,
    participantId: AnonymousId
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const participants = this.sessionParticipants.get(sessionId);
    if (!participants) {
      throw new Error(`Session participants not found: ${sessionId}`);
    }

    // Check if participant is already in session
    if (participants.has(participantId)) {
      logger.warn(`Participant ${participantId} already in session ${sessionId}`);
      return;
    }

    // Add participant
    participants.add(participantId);
    this.participantSessions.set(participantId, sessionId);
    this.updateSessionActivity(sessionId);

    // Update metrics
    const metrics = this.sessionMetrics.get(sessionId);
    if (metrics) {
      const updatedMetrics: SessionMetrics = {
        ...metrics,
        participantCount: participants.size
      };
      this.sessionMetrics.set(sessionId, updatedMetrics);
    }

    // Emit participant joined event
    this.emit('participant-joined', sessionId, participantId);

    logger.info(`Added participant ${participantId} to session ${sessionId}`);
  }

  /**
   * Remove participant from session
   */
  public async removeParticipant(
    sessionId: AnonymousSessionId,
    participantId: AnonymousId
  ): Promise<void> {
    const participants = this.sessionParticipants.get(sessionId);
    if (!participants) {
      logger.warn(`Session participants not found: ${sessionId}`);
      return;
    }

    if (!participants.has(participantId)) {
      logger.warn(`Participant ${participantId} not in session ${sessionId}`);
      return;
    }

    // Remove participant
    participants.delete(participantId);
    this.participantSessions.delete(participantId);
    this.updateSessionActivity(sessionId);

    // Update metrics
    const metrics = this.sessionMetrics.get(sessionId);
    if (metrics) {
      const updatedMetrics: SessionMetrics = {
        ...metrics,
        participantCount: participants.size
      };
      this.sessionMetrics.set(sessionId, updatedMetrics);
    }

    // Emit participant left event
    this.emit('participant-left', sessionId, participantId);

    logger.info(`Removed participant ${participantId} from session ${sessionId}`);

    // End session if no participants left
    if (participants.size === 0) {
      await this.endSession(sessionId, 'No participants remaining');
    }
  }

  /**
   * End call session with complete cleanup
   */
  public async endSession(sessionId: AnonymousSessionId, reason: string = 'Session ended'): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        logger.warn(`Attempted to end non-existent session: ${sessionId}`);
        return;
      }

      // Update final metrics
      const metrics = this.sessionMetrics.get(sessionId);
      if (metrics) {
        const finalMetrics: SessionMetrics = {
          ...metrics,
          status: CallStatus.ENDED,
          duration: Date.now() - metrics.createdAt.getTime(),
          endedAt: new Date()
        };
        this.sessionMetrics.set(sessionId, finalMetrics);
      }

      // Remove all participants
      const participants = this.sessionParticipants.get(sessionId);
      if (participants) {
        participants.forEach(participantId => {
          this.participantSessions.delete(participantId);
        });
      }

      // Cleanup session data
      this.activeSessions.delete(sessionId);
      this.sessionParticipants.delete(sessionId);
      this.sessionActivity.delete(sessionId);

      // Cleanup encryption and security data
      encryptionManager.cleanupSession(sessionId);
      connectionSecurityManager.cleanupSession(sessionId);

      // Emit session ended event
      this.emit('session-ended', sessionId, reason);

      logger.info(`Ended call session: ${sessionId} (${reason})`);
    } catch (error) {
      logger.error(`Error ending session ${sessionId}:`, error as Record<string, unknown>);
    }
  }

  /**
   * Get session participants (anonymous IDs only)
   */
  public getSessionParticipants(sessionId: AnonymousSessionId): AnonymousId[] {
    const participants = this.sessionParticipants.get(sessionId);
    return participants ? Array.from(participants) : [];
  }

  /**
   * Get session metrics
   */
  public getSessionMetrics(sessionId: AnonymousSessionId): SessionMetrics | undefined {
    return this.sessionMetrics.get(sessionId);
  }

  /**
   * Get all active sessions (for monitoring)
   */
  public getActiveSessions(): CallSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get session statistics
   */
  public getSessionStatistics(): {
    activeSessions: number;
    totalParticipants: number;
    averageSessionDuration: number;
    sessionsByStatus: Record<CallStatus, number>;
  } {
    const sessions = Array.from(this.activeSessions.values());
    const metrics = Array.from(this.sessionMetrics.values());
    
    const sessionsByStatus = sessions.reduce((acc, session) => {
      acc[session.status] = (acc[session.status] || 0) + 1;
      return acc;
    }, {} as Record<CallStatus, number>);

    const completedMetrics = metrics.filter(m => m.endedAt);
    const averageSessionDuration = completedMetrics.length > 0
      ? completedMetrics.reduce((sum, m) => sum + m.duration, 0) / completedMetrics.length
      : 0;

    return {
      activeSessions: sessions.length,
      totalParticipants: this.participantSessions.size,
      averageSessionDuration,
      sessionsByStatus
    };
  }

  /**
   * Update session activity timestamp
   */
  private updateSessionActivity(sessionId: AnonymousSessionId): void {
    this.sessionActivity.set(sessionId, new Date());
  }

  /**
   * Generate anonymous session ID
   */
  private generateAnonymousSessionId(): AnonymousSessionId {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `session_${timestamp}_${random}` as AnonymousSessionId;
  }

  /**
   * Start cleanup timer for inactive sessions
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveSessions();
    }, this.cleanupPolicy.cleanupInterval);
  }

  /**
   * Cleanup inactive and expired sessions
   */
  private async cleanupInactiveSessions(): Promise<void> {
    const now = new Date();
    const sessionsToCleanup: AnonymousSessionId[] = [];

    for (const [sessionId, session] of this.activeSessions.entries()) {
      const lastActivity = this.sessionActivity.get(sessionId) || session.createdAt;
      const sessionAge = now.getTime() - session.createdAt.getTime();
      const inactivityTime = now.getTime() - lastActivity.getTime();

      // Check for expired sessions
      if (sessionAge > this.cleanupPolicy.maxSessionDuration) {
        sessionsToCleanup.push(sessionId);
        logger.info(`Session ${sessionId} expired (age: ${sessionAge}ms)`);
        continue;
      }

      // Check for inactive sessions
      if (inactivityTime > this.cleanupPolicy.inactivityTimeout) {
        sessionsToCleanup.push(sessionId);
        logger.info(`Session ${sessionId} inactive (inactive: ${inactivityTime}ms)`);
        continue;
      }
    }

    // Cleanup identified sessions
    for (const sessionId of sessionsToCleanup) {
      await this.endSession(sessionId, 'Session cleanup');
    }

    if (sessionsToCleanup.length > 0) {
      logger.info(`Cleaned up ${sessionsToCleanup.length} inactive sessions`);
    }
  }

  /**
   * Shutdown session manager
   */
  public async shutdown(): Promise<void> {
    try {
      // Stop cleanup timer
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }

      // End all active sessions
      const sessionIds = Array.from(this.activeSessions.keys());
      await Promise.all(sessionIds.map(sessionId => 
        this.endSession(sessionId, 'System shutdown')
      ));

      // Clear all data
      this.activeSessions.clear();
      this.sessionMetrics.clear();
      this.sessionParticipants.clear();
      this.participantSessions.clear();
      this.sessionActivity.clear();

      logger.info('Call session manager shutdown completed');
    } catch (error) {
      logger.error('Error during session manager shutdown:', error as Record<string, unknown>);
    }
  }
}

export const callSessionManager = new CallSessionManager();