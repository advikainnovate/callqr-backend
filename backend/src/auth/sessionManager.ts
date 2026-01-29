/**
 * Session Manager
 * 
 * Handles user session creation, validation, and cleanup with security controls.
 */

import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { UserSession, JWTPayload } from './types';
import { UserId } from '../utils/types';

/**
 * Session configuration
 */
export interface SessionConfig {
  readonly jwtSecret: string;
  readonly sessionDurationHours: number;
  readonly maxConcurrentSessions: number;
  readonly refreshThresholdHours: number;
}

/**
 * Session creation request
 */
export interface CreateSessionRequest {
  readonly userId: UserId;
  readonly ipAddress: string;
  readonly userAgent: string;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  readonly isValid: boolean;
  readonly session?: UserSession;
  readonly needsRefresh?: boolean;
  readonly error?: SessionError;
}

/**
 * Session error types
 */
export enum SessionError {
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_SESSION = 'EXPIRED_SESSION',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  TOO_MANY_SESSIONS = 'TOO_MANY_SESSIONS',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE'
}

/**
 * Session Manager class
 */
export class SessionManager {
  private readonly config: SessionConfig;
  private readonly activeSessions: Map<string, UserSession> = new Map();
  private readonly userSessions: Map<string, Set<string>> = new Map();

  constructor(config: SessionConfig) {
    this.config = config;
    
    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Creates a new session for a user
   */
  async createSession(request: CreateSessionRequest): Promise<{ session: UserSession; token: string }> {
    const userId = request.userId;
    
    // Check concurrent session limit
    const userSessionIds = this.userSessions.get(userId) || new Set();
    if (userSessionIds.size >= this.config.maxConcurrentSessions) {
      // Remove oldest session
      const oldestSessionId = Array.from(userSessionIds)[0];
      await this.destroySession(oldestSessionId);
    }

    // Generate session ID
    const sessionId = this.generateSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (this.config.sessionDurationHours * 60 * 60 * 1000));

    // Create session object
    const session: UserSession = {
      sessionId,
      userId,
      createdAt: now,
      expiresAt,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      isActive: true
    };

    // Store session
    this.activeSessions.set(sessionId, session);
    
    // Track user sessions
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);

    // Generate JWT token
    const token = this.generateJWT(session);

    return { session, token };
  }

  /**
   * Validates a session token
   */
  async validateSession(token: string): Promise<SessionValidationResult> {
    try {
      // Verify JWT token
      const payload = jwt.verify(token, this.config.jwtSecret) as JWTPayload;
      
      // Get session from storage
      const session = this.activeSessions.get(payload.sessionId);
      if (!session) {
        return { isValid: false, error: SessionError.SESSION_NOT_FOUND };
      }

      // Check if session is expired
      if (new Date() > session.expiresAt) {
        await this.destroySession(session.sessionId);
        return { isValid: false, error: SessionError.EXPIRED_SESSION };
      }

      // Check if session is active
      if (!session.isActive) {
        return { isValid: false, error: SessionError.SESSION_NOT_FOUND };
      }

      // Check if session needs refresh
      const refreshThreshold = new Date(
        session.expiresAt.getTime() - (this.config.refreshThresholdHours * 60 * 60 * 1000)
      );
      const needsRefresh = new Date() > refreshThreshold;

      return {
        isValid: true,
        session,
        needsRefresh
      };

    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        return { isValid: false, error: SessionError.INVALID_TOKEN };
      }
      
      console.error('Session validation error:', error);
      return { isValid: false, error: SessionError.INVALID_TOKEN };
    }
  }

  /**
   * Refreshes a session token
   */
  async refreshSession(sessionId: string): Promise<{ session: UserSession; token: string } | null> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) {
      return null;
    }

    // Extend expiration time
    const newExpiresAt = new Date(Date.now() + (this.config.sessionDurationHours * 60 * 60 * 1000));
    const updatedSession: UserSession = {
      ...session,
      expiresAt: newExpiresAt
    };

    // Update stored session
    this.activeSessions.set(sessionId, updatedSession);

    // Generate new JWT token
    const token = this.generateJWT(updatedSession);

    return { session: updatedSession, token };
  }

  /**
   * Destroys a session
   */
  async destroySession(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Remove from active sessions
    this.activeSessions.delete(sessionId);

    // Remove from user sessions tracking
    const userSessionIds = this.userSessions.get(session.userId);
    if (userSessionIds) {
      userSessionIds.delete(sessionId);
      if (userSessionIds.size === 0) {
        this.userSessions.delete(session.userId);
      }
    }

    return true;
  }

  /**
   * Destroys all sessions for a user
   */
  async destroyAllUserSessions(userId: UserId): Promise<number> {
    const userSessionIds = this.userSessions.get(userId);
    if (!userSessionIds) {
      return 0;
    }

    let destroyedCount = 0;
    for (const sessionId of userSessionIds) {
      if (await this.destroySession(sessionId)) {
        destroyedCount++;
      }
    }

    return destroyedCount;
  }

  /**
   * Gets active sessions for a user
   */
  getUserSessions(userId: UserId): UserSession[] {
    const userSessionIds = this.userSessions.get(userId);
    if (!userSessionIds) {
      return [];
    }

    const sessions: UserSession[] = [];
    for (const sessionId of userSessionIds) {
      const session = this.activeSessions.get(sessionId);
      if (session && session.isActive) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Generates a secure session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generates a JWT token for a session
   */
  private generateJWT(session: UserSession): string {
    const payload: JWTPayload = {
      userId: session.userId,
      sessionId: session.sessionId,
      iat: Math.floor(session.createdAt.getTime() / 1000),
      exp: Math.floor(session.expiresAt.getTime() / 1000),
      iss: 'privacy-qr-calling'
    };

    return jwt.sign(payload, this.config.jwtSecret, {
      algorithm: 'HS256'
    });
  }

  /**
   * Starts periodic cleanup of expired sessions
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 15 * 60 * 1000); // Run every 15 minutes
  }

  /**
   * Cleans up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    const expiredSessionIds: string[] = [];

    for (const [sessionId, session] of this.activeSessions) {
      if (now > session.expiresAt) {
        expiredSessionIds.push(sessionId);
      }
    }

    for (const sessionId of expiredSessionIds) {
      this.destroySession(sessionId);
    }

    if (expiredSessionIds.length > 0) {
      console.log(`Cleaned up ${expiredSessionIds.length} expired sessions`);
    }
  }
}