/**
 * Anonymous Session Manager
 * 
 * Manages anonymous call sessions with privacy protection, ensuring no
 * personal information is exposed during session lifecycle management.
 * 
 * Requirements: 3.1, 3.2
 */

import { AnonymousId } from '../security/types';
import { AnonymousSessionId } from '../utils/types';
import { PrivacyLayer } from './privacyLayer';
import { 
  CallSessionRecord, 
  CallStatus, 
  SessionCreationResult, 
  SessionCreationError,
  SessionLookupResult,
  SessionParticipants,
  CallSessionRequest
} from './types';
import { randomBytes, createHash } from 'crypto';

/**
 * Session manager configuration
 */
export interface SessionManagerConfig {
  readonly maxActiveSessions: number;
  readonly sessionTimeoutMinutes: number;
  readonly cleanupIntervalMinutes: number;
  readonly enableSessionLogging: boolean;
}

/**
 * Default session manager configuration
 */
const DEFAULT_CONFIG: SessionManagerConfig = {
  maxActiveSessions: 1000,
  sessionTimeoutMinutes: 60, // 1 hour max session
  cleanupIntervalMinutes: 15, // Cleanup every 15 minutes
  enableSessionLogging: false // Disabled by default for privacy
};

/**
 * Anonymous session manager
 */
export class SessionManager {
  private readonly config: SessionManagerConfig;
  private readonly privacyLayer: PrivacyLayer;
  private readonly activeSessions: Map<string, CallSessionRecord>;
  private readonly participantSessions: Map<string, Set<string>>;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    privacyLayer: PrivacyLayer,
    config: Partial<SessionManagerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.privacyLayer = privacyLayer;
    this.activeSessions = new Map();
    this.participantSessions = new Map();
    
    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Create a new anonymous session between two participants
   * 
   * @param request - Call session request with participant IDs
   * @returns Promise resolving to SessionCreationResult
   */
  async createAnonymousSession(request: CallSessionRequest): Promise<SessionCreationResult> {
    try {
      const { callerId, calleeId } = request;

      // Validate participants
      if (!this.validateParticipants(callerId, calleeId)) {
        return {
          success: false,
          error: SessionCreationError.INVALID_PARTICIPANTS
        };
      }

      // Check if participants already have an active session
      if (this.hasActiveSessionBetween(callerId, calleeId)) {
        return {
          success: false,
          error: SessionCreationError.DUPLICATE_SESSION
        };
      }

      // Check session limits
      if (this.activeSessions.size >= this.config.maxActiveSessions) {
        // Try to cleanup expired sessions first
        await this.cleanupExpiredSessions();
        
        if (this.activeSessions.size >= this.config.maxActiveSessions) {
          return {
            success: false,
            error: SessionCreationError.STORAGE_ERROR
          };
        }
      }

      // Generate session ID and encryption fingerprint
      const sessionId = this.privacyLayer.generateAnonymousSessionId();
      const encryptionKeyFingerprint = this.generateEncryptionFingerprint();

      // Create session record
      const sessionRecord: CallSessionRecord = {
        sessionId,
        participantA: callerId,
        participantB: calleeId,
        status: CallStatus.INITIATING,
        createdAt: new Date(),
        encryptionKeyFingerprint
      };

      // Store session
      this.activeSessions.set(sessionId, sessionRecord);
      
      // Update participant mappings
      this.addParticipantSession(callerId, sessionId);
      this.addParticipantSession(calleeId, sessionId);

      // Log session creation (privacy-compliant)
      if (this.config.enableSessionLogging) {
        this.logSessionEvent('SESSION_CREATED', sessionId, callerId, calleeId);
      }

      return {
        success: true,
        sessionId
      };

    } catch (error) {
      console.error('Session creation failed:', this.sanitizeError(error));
      return {
        success: false,
        error: SessionCreationError.CREATION_FAILED
      };
    }
  }

  /**
   * Get session participants by session ID
   * 
   * @param sessionId - AnonymousSessionId to lookup
   * @returns Promise resolving to SessionParticipants or null
   */
  async getSessionParticipants(sessionId: AnonymousSessionId): Promise<SessionParticipants | null> {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    return {
      participantA: session.participantA,
      participantB: session.participantB
    };
  }

  /**
   * Update session status
   * 
   * @param sessionId - AnonymousSessionId to update
   * @param status - New CallStatus
   * @returns Promise resolving to success status
   */
  async updateSessionStatus(sessionId: AnonymousSessionId, status: CallStatus): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return false;
    }

    // Create updated session record
    const updatedSession: CallSessionRecord = {
      ...session,
      status,
      endedAt: status === CallStatus.ENDED || status === CallStatus.FAILED ? new Date() : session.endedAt
    };

    // Update stored session
    this.activeSessions.set(sessionId, updatedSession);

    // Log status change (privacy-compliant)
    if (this.config.enableSessionLogging) {
      this.logSessionEvent('STATUS_CHANGED', sessionId, session.participantA, session.participantB, status);
    }

    return true;
  }

  /**
   * Clean up and remove a session
   * 
   * @param sessionId - AnonymousSessionId to cleanup
   * @returns Promise resolving to success status
   */
  async cleanupSession(sessionId: AnonymousSessionId): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return false;
    }

    // Remove from active sessions
    this.activeSessions.delete(sessionId);

    // Remove participant mappings
    this.removeParticipantSession(session.participantA, sessionId);
    this.removeParticipantSession(session.participantB, sessionId);

    // Clear privacy layer mappings for participants
    this.privacyLayer.clearAnonymousMapping(session.participantA);
    this.privacyLayer.clearAnonymousMapping(session.participantB);

    // Log session cleanup (privacy-compliant)
    if (this.config.enableSessionLogging) {
      this.logSessionEvent('SESSION_CLEANED', sessionId, session.participantA, session.participantB);
    }

    return true;
  }

  /**
   * Get session by ID
   * 
   * @param sessionId - AnonymousSessionId to lookup
   * @returns SessionLookupResult
   */
  getSession(sessionId: AnonymousSessionId): SessionLookupResult {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return { found: false };
    }

    return {
      found: true,
      session,
      participants: {
        participantA: session.participantA,
        participantB: session.participantB
      }
    };
  }

  /**
   * Get all active sessions for a participant
   * 
   * @param participantId - AnonymousId to lookup sessions for
   * @returns Array of session IDs
   */
  getParticipantSessions(participantId: AnonymousId): AnonymousSessionId[] {
    const sessionIds = this.participantSessions.get(participantId);
    return sessionIds ? Array.from(sessionIds) as AnonymousSessionId[] : [];
  }

  /**
   * Get session statistics
   * 
   * @returns Session statistics object
   */
  getSessionStats(): {
    activeSessions: number;
    participantMappings: number;
    statusBreakdown: Record<CallStatus, number>;
  } {
    const statusBreakdown: Record<CallStatus, number> = {
      [CallStatus.INITIATING]: 0,
      [CallStatus.RINGING]: 0,
      [CallStatus.CONNECTED]: 0,
      [CallStatus.ENDED]: 0,
      [CallStatus.FAILED]: 0
    };

    for (const session of this.activeSessions.values()) {
      statusBreakdown[session.status]++;
    }

    return {
      activeSessions: this.activeSessions.size,
      participantMappings: this.participantSessions.size,
      statusBreakdown
    };
  }

  /**
   * Cleanup expired sessions
   * 
   * @returns Promise resolving to number of cleaned sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const now = new Date();
    const timeoutMs = this.config.sessionTimeoutMinutes * 60 * 1000;
    let cleanedCount = 0;

    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.activeSessions.entries()) {
      const sessionAge = now.getTime() - session.createdAt.getTime();
      
      // Check if session is expired or ended
      if (sessionAge > timeoutMs || 
          session.status === CallStatus.ENDED || 
          session.status === CallStatus.FAILED) {
        expiredSessions.push(sessionId);
      }
    }

    // Clean up expired sessions
    for (const sessionId of expiredSessions) {
      await this.cleanupSession(sessionId as AnonymousSessionId);
      cleanedCount++;
    }

    if (cleanedCount > 0 && this.config.enableSessionLogging) {
      console.log(`Cleaned up ${cleanedCount} expired sessions`);
    }

    return cleanedCount;
  }

  /**
   * Shutdown session manager and cleanup resources
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Clear all sessions
    this.activeSessions.clear();
    this.participantSessions.clear();
  }

  /**
   * Validate participant IDs
   * 
   * @param callerId - Caller's anonymous ID
   * @param calleeId - Callee's anonymous ID
   * @returns True if participants are valid
   */
  private validateParticipants(callerId: AnonymousId, calleeId: AnonymousId): boolean {
    return callerId !== calleeId && 
           callerId.startsWith('anon_') && 
           calleeId.startsWith('anon_');
  }

  /**
   * Check if participants already have an active session
   * 
   * @param callerId - Caller's anonymous ID
   * @param calleeId - Callee's anonymous ID
   * @returns True if active session exists
   */
  private hasActiveSessionBetween(callerId: AnonymousId, calleeId: AnonymousId): boolean {
    const callerSessions = this.participantSessions.get(callerId);
    const calleeSessions = this.participantSessions.get(calleeId);

    if (!callerSessions || !calleeSessions) {
      return false;
    }

    // Check for intersection of session sets
    for (const sessionId of callerSessions) {
      if (calleeSessions.has(sessionId)) {
        const session = this.activeSessions.get(sessionId);
        if (session && session.status !== CallStatus.ENDED && session.status !== CallStatus.FAILED) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Add session to participant mapping
   * 
   * @param participantId - Participant's anonymous ID
   * @param sessionId - Session ID to add
   */
  private addParticipantSession(participantId: AnonymousId, sessionId: AnonymousSessionId): void {
    if (!this.participantSessions.has(participantId)) {
      this.participantSessions.set(participantId, new Set());
    }
    this.participantSessions.get(participantId)!.add(sessionId);
  }

  /**
   * Remove session from participant mapping
   * 
   * @param participantId - Participant's anonymous ID
   * @param sessionId - Session ID to remove
   */
  private removeParticipantSession(participantId: AnonymousId, sessionId: AnonymousSessionId): void {
    const sessions = this.participantSessions.get(participantId);
    if (sessions) {
      sessions.delete(sessionId);
      if (sessions.size === 0) {
        this.participantSessions.delete(participantId);
      }
    }
  }

  /**
   * Generate encryption key fingerprint for audit purposes
   * 
   * @returns Encryption key fingerprint
   */
  private generateEncryptionFingerprint(): string {
    const randomData = randomBytes(32);
    return createHash('sha256').update(randomData).digest('hex').substring(0, 16);
  }

  /**
   * Start cleanup timer for expired sessions
   */
  private startCleanupTimer(): void {
    const intervalMs = this.config.cleanupIntervalMinutes * 60 * 1000;
    
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        console.error('Session cleanup failed:', this.sanitizeError(error));
      }
    }, intervalMs);
  }

  /**
   * Log session event (privacy-compliant)
   * 
   * @param event - Event type
   * @param sessionId - Session ID
   * @param participantA - First participant
   * @param participantB - Second participant
   * @param status - Optional status
   */
  private logSessionEvent(
    event: string, 
    sessionId: AnonymousSessionId, 
    participantA: AnonymousId, 
    participantB: AnonymousId,
    status?: CallStatus
  ): void {
    const logData = {
      event,
      sessionId: sessionId.substring(0, 12) + '...',
      participantA: participantA.substring(0, 12) + '...',
      participantB: participantB.substring(0, 12) + '...',
      status,
      timestamp: new Date().toISOString()
    };

    console.log('Session event:', logData);
  }

  /**
   * Sanitize error for logging
   * 
   * @param error - Error to sanitize
   * @returns Sanitized error
   */
  private sanitizeError(error: any): any {
    if (error instanceof Error) {
      return {
        message: error.message,
        type: error.constructor.name
      };
    }
    return 'Unknown error occurred';
  }
}

/**
 * Session manager factory for creating configured instances
 */
export class SessionManagerFactory {
  static create(
    privacyLayer: PrivacyLayer,
    config?: Partial<SessionManagerConfig>
  ): SessionManager {
    return new SessionManager(privacyLayer, config);
  }

  static createWithDefaults(privacyLayer: PrivacyLayer): SessionManager {
    return new SessionManager(privacyLayer);
  }
}