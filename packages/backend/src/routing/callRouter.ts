/**
 * Call Router Service
 * 
 * Provides call routing functionality with privacy protection, ensuring
 * anonymous communication between parties without exposing personal information.
 * 
 * Requirements: 3.3, 3.4
 */

import { SecureToken, UserId, AnonymousId } from '../security/types';
import { AnonymousSessionId } from '../utils/types';
import { TokenMapper } from './tokenMapper';
import { SessionManager } from './sessionManager';
import { PrivacyLayer } from './privacyLayer';
import { 
  CallStatus, 
  CallSessionRecord, 
  CallSessionRequest,
  SessionCreationResult,
  TokenResolutionResult
} from './types';

/**
 * Call initiation request
 */
export interface CallInitiationRequest {
  readonly scannedToken: SecureToken;
  readonly callerAnonymousId?: AnonymousId; // Optional, will be generated if not provided
}

/**
 * Call initiation result
 */
export interface CallInitiationResult {
  readonly success: boolean;
  readonly sessionId?: AnonymousSessionId;
  readonly callerAnonymousId?: AnonymousId;
  readonly calleeAnonymousId?: AnonymousId;
  readonly error?: CallInitiationError;
}

/**
 * Call initiation error types
 */
export enum CallInitiationError {
  TOKEN_RESOLUTION_FAILED = 'TOKEN_RESOLUTION_FAILED',
  SESSION_CREATION_FAILED = 'SESSION_CREATION_FAILED',
  CALLER_ANONYMIZATION_FAILED = 'CALLER_ANONYMIZATION_FAILED',
  PRIVACY_VIOLATION = 'PRIVACY_VIOLATION',
  ROUTING_FAILED = 'ROUTING_FAILED'
}

/**
 * Call termination result
 */
export interface CallTerminationResult {
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Call router configuration
 */
export interface CallRouterConfig {
  readonly enableCallLogging: boolean;
  readonly maxConcurrentCalls: number;
  readonly callTimeoutMinutes: number;
  readonly enablePrivacyValidation: boolean;
}

/**
 * Default call router configuration
 */
const DEFAULT_CONFIG: CallRouterConfig = {
  enableCallLogging: false, // Disabled by default for privacy
  maxConcurrentCalls: 500,
  callTimeoutMinutes: 60,
  enablePrivacyValidation: true
};

/**
 * Call router service with privacy layer
 */
export class CallRouter {
  private readonly config: CallRouterConfig;
  private readonly tokenMapper: TokenMapper;
  private readonly sessionManager: SessionManager;
  private readonly privacyLayer: PrivacyLayer;

  constructor(
    tokenMapper: TokenMapper,
    sessionManager: SessionManager,
    privacyLayer: PrivacyLayer,
    config: Partial<CallRouterConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokenMapper = tokenMapper;
    this.sessionManager = sessionManager;
    this.privacyLayer = privacyLayer;
  }

  /**
   * Initiate a call using a scanned token
   * 
   * @param request - Call initiation request
   * @returns Promise resolving to CallInitiationResult
   */
  async initiateCall(request: CallInitiationRequest): Promise<CallInitiationResult> {
    try {
      const { scannedToken, callerAnonymousId } = request;

      // Step 1: Resolve token to callee user ID and anonymous ID
      const tokenResolution = await this.tokenMapper.resolveTokenToUser(scannedToken);
      
      if (!tokenResolution.success || !tokenResolution.userId || !tokenResolution.anonymousId) {
        return {
          success: false,
          error: CallInitiationError.TOKEN_RESOLUTION_FAILED
        };
      }

      const calleeUserId = tokenResolution.userId;
      const calleeAnonymousId = tokenResolution.anonymousId;

      // Step 2: Generate or use provided caller anonymous ID
      let finalCallerAnonymousId: AnonymousId;
      
      if (callerAnonymousId) {
        finalCallerAnonymousId = callerAnonymousId;
      } else {
        // Generate anonymous ID for caller (we don't have their user ID in this context)
        finalCallerAnonymousId = this.privacyLayer.generateAnonymousId();
      }

      // Step 3: Validate privacy compliance
      if (this.config.enablePrivacyValidation) {
        const privacyCheck = this.validateCallPrivacy(finalCallerAnonymousId, calleeAnonymousId);
        if (!privacyCheck.compliant) {
          return {
            success: false,
            error: CallInitiationError.PRIVACY_VIOLATION
          };
        }
      }

      // Step 4: Create anonymous session
      const sessionRequest: CallSessionRequest = {
        callerId: finalCallerAnonymousId,
        calleeId: calleeAnonymousId
      };

      const sessionResult = await this.sessionManager.createAnonymousSession(sessionRequest);
      
      if (!sessionResult.success || !sessionResult.sessionId) {
        return {
          success: false,
          error: CallInitiationError.SESSION_CREATION_FAILED
        };
      }

      // Step 5: Log call initiation (privacy-compliant)
      if (this.config.enableCallLogging) {
        this.logCallEvent('CALL_INITIATED', sessionResult.sessionId, finalCallerAnonymousId, calleeAnonymousId);
      }

      return {
        success: true,
        sessionId: sessionResult.sessionId,
        callerAnonymousId: finalCallerAnonymousId,
        calleeAnonymousId: calleeAnonymousId
      };

    } catch (error) {
      console.error('Call initiation failed:', this.sanitizeError(error));
      return {
        success: false,
        error: CallInitiationError.ROUTING_FAILED
      };
    }
  }

  /**
   * Route call between two users using their user IDs
   * (Internal method for when we have both user IDs)
   * 
   * @param callerUserId - Caller's user ID
   * @param calleeUserId - Callee's user ID
   * @returns Promise resolving to CallInitiationResult
   */
  async routeCall(callerUserId: UserId, calleeUserId: UserId): Promise<CallInitiationResult> {
    try {
      // Generate anonymous IDs for both parties
      const callerAnonymousId = this.tokenMapper.getAnonymousIdForUser(callerUserId);
      const calleeAnonymousId = this.tokenMapper.getAnonymousIdForUser(calleeUserId);

      // Validate privacy compliance
      if (this.config.enablePrivacyValidation) {
        const privacyCheck = this.validateCallPrivacy(callerAnonymousId, calleeAnonymousId);
        if (!privacyCheck.compliant) {
          return {
            success: false,
            error: CallInitiationError.PRIVACY_VIOLATION
          };
        }
      }

      // Create anonymous session
      const sessionRequest: CallSessionRequest = {
        callerId: callerAnonymousId,
        calleeId: calleeAnonymousId
      };

      const sessionResult = await this.sessionManager.createAnonymousSession(sessionRequest);
      
      if (!sessionResult.success || !sessionResult.sessionId) {
        return {
          success: false,
          error: CallInitiationError.SESSION_CREATION_FAILED
        };
      }

      // Log call routing (privacy-compliant)
      if (this.config.enableCallLogging) {
        this.logCallEvent('CALL_ROUTED', sessionResult.sessionId, callerAnonymousId, calleeAnonymousId);
      }

      return {
        success: true,
        sessionId: sessionResult.sessionId,
        callerAnonymousId,
        calleeAnonymousId
      };

    } catch (error) {
      console.error('Call routing failed:', this.sanitizeError(error));
      return {
        success: false,
        error: CallInitiationError.ROUTING_FAILED
      };
    }
  }

  /**
   * Update call status
   * 
   * @param sessionId - Session ID to update
   * @param status - New call status
   * @returns Promise resolving to success status
   */
  async updateCallStatus(sessionId: AnonymousSessionId, status: CallStatus): Promise<boolean> {
    try {
      const success = await this.sessionManager.updateSessionStatus(sessionId, status);
      
      if (success && this.config.enableCallLogging) {
        const session = this.sessionManager.getSession(sessionId);
        if (session.found && session.participants) {
          this.logCallEvent(
            'STATUS_UPDATED', 
            sessionId, 
            session.participants.participantA, 
            session.participants.participantB,
            status
          );
        }
      }

      return success;
    } catch (error) {
      console.error('Call status update failed:', this.sanitizeError(error));
      return false;
    }
  }

  /**
   * Terminate a call session
   * 
   * @param sessionId - Session ID to terminate
   * @returns Promise resolving to CallTerminationResult
   */
  async terminateCall(sessionId: AnonymousSessionId): Promise<CallTerminationResult> {
    try {
      // Update status to ended first
      await this.sessionManager.updateSessionStatus(sessionId, CallStatus.ENDED);
      
      // Clean up the session
      const success = await this.sessionManager.cleanupSession(sessionId);
      
      if (success && this.config.enableCallLogging) {
        this.logCallEvent('CALL_TERMINATED', sessionId);
      }

      return {
        success
      };

    } catch (error) {
      console.error('Call termination failed:', this.sanitizeError(error));
      return {
        success: false,
        error: 'Call termination failed'
      };
    }
  }

  /**
   * Get call session information
   * 
   * @param sessionId - Session ID to lookup
   * @returns Call session record or null
   */
  getCallSession(sessionId: AnonymousSessionId): CallSessionRecord | null {
    const sessionResult = this.sessionManager.getSession(sessionId);
    return sessionResult.found ? sessionResult.session! : null;
  }

  /**
   * Get active calls for a participant
   * 
   * @param participantId - Anonymous participant ID
   * @returns Array of active session IDs
   */
  getActiveCallsForParticipant(participantId: AnonymousId): AnonymousSessionId[] {
    return this.sessionManager.getParticipantSessions(participantId);
  }

  /**
   * Get call routing statistics
   * 
   * @returns Call routing statistics
   */
  getRoutingStats(): {
    activeCalls: number;
    totalParticipants: number;
    statusBreakdown: Record<CallStatus, number>;
  } {
    const sessionStats = this.sessionManager.getSessionStats();
    
    return {
      activeCalls: sessionStats.activeSessions,
      totalParticipants: sessionStats.participantMappings,
      statusBreakdown: sessionStats.statusBreakdown
    };
  }

  /**
   * Validate call privacy compliance
   * 
   * @param callerAnonymousId - Caller's anonymous ID
   * @param calleeAnonymousId - Callee's anonymous ID
   * @returns Privacy validation result
   */
  private validateCallPrivacy(callerAnonymousId: AnonymousId, calleeAnonymousId: AnonymousId): {
    compliant: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    // Check that both IDs are properly anonymized
    if (!callerAnonymousId.startsWith('anon_')) {
      violations.push('Caller ID not properly anonymized');
    }

    if (!calleeAnonymousId.startsWith('anon_')) {
      violations.push('Callee ID not properly anonymized');
    }

    // Check that IDs are different
    if (callerAnonymousId === calleeAnonymousId) {
      violations.push('Caller and callee cannot be the same');
    }

    // Validate with privacy layer
    const callerValidation = this.privacyLayer.validatePrivacyCompliance(callerAnonymousId);
    const calleeValidation = this.privacyLayer.validatePrivacyCompliance(calleeAnonymousId);

    violations.push(...callerValidation.violations);
    violations.push(...calleeValidation.violations);

    return {
      compliant: violations.length === 0,
      violations
    };
  }

  /**
   * Log call event (privacy-compliant)
   * 
   * @param event - Event type
   * @param sessionId - Session ID
   * @param callerAnonymousId - Caller's anonymous ID (optional)
   * @param calleeAnonymousId - Callee's anonymous ID (optional)
   * @param status - Call status (optional)
   */
  private logCallEvent(
    event: string,
    sessionId: AnonymousSessionId,
    callerAnonymousId?: AnonymousId,
    calleeAnonymousId?: AnonymousId,
    status?: CallStatus
  ): void {
    const logData: any = {
      event,
      sessionId: sessionId.substring(0, 12) + '...',
      timestamp: new Date().toISOString()
    };

    if (callerAnonymousId) {
      logData.caller = callerAnonymousId.substring(0, 12) + '...';
    }

    if (calleeAnonymousId) {
      logData.callee = calleeAnonymousId.substring(0, 12) + '...';
    }

    if (status) {
      logData.status = status;
    }

    console.log('Call routing event:', logData);
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
 * Call router factory for creating configured instances
 */
export class CallRouterFactory {
  static create(
    tokenMapper: TokenMapper,
    sessionManager: SessionManager,
    privacyLayer: PrivacyLayer,
    config?: Partial<CallRouterConfig>
  ): CallRouter {
    return new CallRouter(tokenMapper, sessionManager, privacyLayer, config);
  }

  static createWithDefaults(
    tokenMapper: TokenMapper,
    sessionManager: SessionManager,
    privacyLayer: PrivacyLayer
  ): CallRouter {
    return new CallRouter(tokenMapper, sessionManager, privacyLayer);
  }
}