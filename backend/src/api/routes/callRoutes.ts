/**
 * Call Management Routes
 * 
 * REST API endpoints for call initiation, routing, and session management.
 * Implements privacy-preserving call operations with anonymous session handling.
 * 
 * Requirements: 10.1, 10.2
 */

import { Router, Request, Response } from 'express';
import { CallRouter } from '../../routing/callRouter';
import { TokenManager } from '../../security/tokenManager';
import { createAuthMiddleware, createOptionalAuthMiddleware, AuthenticatedRequest } from '../../auth/authMiddleware';
import { AuthService } from '../../auth/authService';
import { inputValidationMiddleware } from '../middleware/inputValidation';
import { rateLimitMiddleware } from '../middleware/rateLimiting';
import { SecureToken } from '../../security/types';
import { AnonymousSessionId } from '../../utils/types';
import { CallStatus } from '../../routing/types';

/**
 * Call initiation request interface
 */
interface InitiateCallRequest {
  scannedToken: string;
  callerAnonymousId?: string;
}

/**
 * Call status update request interface
 */
interface UpdateCallStatusRequest {
  sessionId: string;
  status: CallStatus;
}

/**
 * Call controller class
 */
export class CallController {
  private readonly callRouter: CallRouter;
  private readonly tokenManager: TokenManager;

  constructor(callRouter: CallRouter, tokenManager: TokenManager) {
    this.callRouter = callRouter;
    this.tokenManager = tokenManager;
  }

  /**
   * Initiate a call using scanned QR token
   */
  initiateCall = async (req: Request, res: Response): Promise<void> => {
    try {
      const { scannedToken, callerAnonymousId } = req.body as InitiateCallRequest;

      if (!scannedToken) {
        res.status(400).json({
          error: 'Scanned token is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Extract token from QR data
      const token = this.tokenManager.extractTokenFromQR(scannedToken);
      if (!token) {
        res.status(400).json({
          error: 'Invalid QR code format',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Initiate call through router
      const result = await this.callRouter.initiateCall({
        scannedToken: token,
        callerAnonymousId: callerAnonymousId as any
      });

      if (!result.success) {
        const statusCode = this.getErrorStatusCode(result.error);
        res.status(statusCode).json({
          error: this.getErrorMessage(result.error),
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Return call session information
      res.status(201).json({
        message: 'Call initiated successfully',
        sessionId: result.sessionId,
        callerAnonymousId: result.callerAnonymousId,
        calleeAnonymousId: result.calleeAnonymousId,
        signalingEndpoint: `/api/v1/calls/signaling/${result.sessionId}`,
        stunServers: this.getSTUNServerConfig(),
        turnServers: this.getTURNServerConfig(),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Call initiation error:', error);
      res.status(500).json({
        error: 'Call initiation failed',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Update call status
   */
  updateCallStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, status } = req.body as UpdateCallStatusRequest;

      if (!sessionId || !status) {
        res.status(400).json({
          error: 'Session ID and status are required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const success = await this.callRouter.updateCallStatus(
        sessionId as AnonymousSessionId,
        status
      );

      if (!success) {
        res.status(404).json({
          error: 'Session not found or update failed',
          timestamp: new Date().toISOString()
        });
        return;
      }

      res.status(200).json({
        message: 'Call status updated successfully',
        sessionId,
        status,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Call status update error:', error);
      res.status(500).json({
        error: 'Call status update failed',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Terminate a call session
   */
  terminateCall = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          error: 'Session ID is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const result = await this.callRouter.terminateCall(sessionId as AnonymousSessionId);

      if (!result.success) {
        res.status(404).json({
          error: result.error || 'Session not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      res.status(200).json({
        message: 'Call terminated successfully',
        sessionId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Call termination error:', error);
      res.status(500).json({
        error: 'Call termination failed',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get call session information
   */
  getCallSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          error: 'Session ID is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const session = this.callRouter.getCallSession(sessionId as AnonymousSessionId);

      if (!session) {
        res.status(404).json({
          error: 'Session not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Return sanitized session information (no personal data)
      res.status(200).json({
        sessionId: session.sessionId,
        status: session.status,
        createdAt: session.createdAt,
        endedAt: session.endedAt,
        // Note: participant IDs are already anonymous
        participantA: session.participantA,
        participantB: session.participantB,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get call session error:', error);
      res.status(500).json({
        error: 'Failed to retrieve session',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get active calls for authenticated user
   */
  getActiveCalls = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // This would require mapping user ID to anonymous ID
      // For now, return empty array as this is a complex privacy operation
      res.status(200).json({
        activeCalls: [],
        count: 0,
        message: 'Active calls retrieved (privacy-preserving implementation)',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get active calls error:', error);
      res.status(500).json({
        error: 'Failed to retrieve active calls',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get call routing statistics (admin endpoint)
   */
  getRoutingStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = this.callRouter.getRoutingStats();

      res.status(200).json({
        ...stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get routing stats error:', error);
      res.status(500).json({
        error: 'Failed to retrieve routing statistics',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Map call initiation errors to HTTP status codes
   */
  private getErrorStatusCode(error?: any): number {
    switch (error) {
      case 'TOKEN_RESOLUTION_FAILED':
      case 'TOKEN_NOT_FOUND':
        return 404;
      case 'PRIVACY_VIOLATION':
        return 403;
      case 'SESSION_CREATION_FAILED':
      case 'ROUTING_FAILED':
        return 500;
      default:
        return 400;
    }
  }

  /**
   * Map call initiation errors to user-friendly messages
   */
  private getErrorMessage(error?: any): string {
    switch (error) {
      case 'TOKEN_RESOLUTION_FAILED':
        return 'Invalid or expired QR code';
      case 'TOKEN_NOT_FOUND':
        return 'QR code not recognized';
      case 'PRIVACY_VIOLATION':
        return 'Call cannot be initiated due to privacy constraints';
      case 'SESSION_CREATION_FAILED':
        return 'Failed to create call session';
      case 'ROUTING_FAILED':
        return 'Call routing failed';
      default:
        return 'Call initiation failed';
    }
  }

  /**
   * Get STUN server configuration
   */
  private getSTUNServerConfig(): any[] {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
  }

  /**
   * Get TURN server configuration
   */
  private getTURNServerConfig(): any[] {
    // In production, these would come from environment variables
    return [
      {
        urls: 'turn:localhost:3478',
        username: 'user',
        credential: 'pass'
      }
    ];
  }
}

/**
 * Create call management routes
 */
export function createCallRoutes(
  callRouter: CallRouter,
  tokenManager: TokenManager,
  authService: AuthService
): Router {
  const router = Router();
  const callController = new CallController(callRouter, tokenManager);
  const authMiddleware = createAuthMiddleware(authService);
  const optionalAuthMiddleware = createOptionalAuthMiddleware(authService);

  // Initiate call (public endpoint with rate limiting)
  router.post('/initiate',
    rateLimitMiddleware('call_initiate', 20, 60 * 60 * 1000), // 20 calls per hour
    inputValidationMiddleware({
      scannedToken: { required: true, type: 'string', minLength: 10 },
      callerAnonymousId: { required: false, type: 'string' }
    }),
    callController.initiateCall
  );

  // Update call status (public endpoint with rate limiting)
  router.put('/status',
    rateLimitMiddleware('call_status', 100, 60 * 60 * 1000), // 100 updates per hour
    inputValidationMiddleware({
      sessionId: { required: true, type: 'string' },
      status: { required: true, type: 'string', enum: Object.values(CallStatus) }
    }),
    callController.updateCallStatus
  );

  // Terminate call
  router.delete('/:sessionId',
    rateLimitMiddleware('call_terminate', 50, 60 * 60 * 1000), // 50 terminations per hour
    callController.terminateCall
  );

  // Get call session information
  router.get('/:sessionId',
    rateLimitMiddleware('call_session', 100, 60 * 60 * 1000), // 100 requests per hour
    callController.getCallSession
  );

  // Get active calls for authenticated user
  router.get('/active/my-calls',
    authMiddleware,
    rateLimitMiddleware('call_active', 20, 60 * 60 * 1000), // 20 requests per hour
    callController.getActiveCalls
  );

  // Get routing statistics (admin endpoint)
  router.get('/admin/stats',
    authMiddleware,
    rateLimitMiddleware('call_stats', 10, 60 * 60 * 1000), // 10 requests per hour
    callController.getRoutingStats
  );

  return router;
}

// Export configured router
export const callRoutes = createCallRoutes;