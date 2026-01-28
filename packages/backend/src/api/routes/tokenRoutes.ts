/**
 * Token Management Routes
 * 
 * REST API endpoints for secure token generation, validation, and management.
 * Implements privacy-preserving token operations for QR-based calling.
 * 
 * Requirements: 10.1, 10.2
 */

import { Router, Request, Response } from 'express';
import { TokenManager } from '../../security/tokenManager';
import { createAuthMiddleware, AuthenticatedRequest } from '../../auth/authMiddleware';
import { AuthService } from '../../auth/authService';
import { inputValidationMiddleware } from '../middleware/inputValidation';
import { rateLimitMiddleware } from '../middleware/rateLimiting';
import { UserId } from '../../utils/types';

/**
 * Token generation request interface
 */
interface GenerateTokenRequest {
  userId?: UserId; // Optional, will use authenticated user if not provided
}

/**
 * Token validation request interface
 */
interface ValidateTokenRequest {
  token: string;
}

/**
 * Token controller class
 */
export class TokenController {
  private readonly tokenManager: TokenManager;

  constructor(tokenManager: TokenManager) {
    this.tokenManager = tokenManager;
  }

  /**
   * Generate new token for authenticated user
   */
  generateToken = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const userId = req.user.userId;
      const token = await this.tokenManager.generateToken(userId as any);
      const qrCodeData = this.tokenManager.formatTokenForQR(token);

      res.status(201).json({
        message: 'Token generated successfully',
        qrCodeData,
        tokenId: token.value.substring(0, 8) + '...', // Partial token for client reference
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Token generation error:', error);
      res.status(500).json({
        error: 'Token generation failed',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Validate token from QR code data
   */
  validateToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.body as ValidateTokenRequest;

      if (!token) {
        res.status(400).json({
          error: 'Token is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const validationResult = await this.tokenManager.validateToken(token);

      if (!validationResult.isValid) {
        res.status(400).json({
          valid: false,
          canInitiateCall: false,
          error: 'Invalid or expired token',
          timestamp: new Date().toISOString()
        });
        return;
      }

      res.status(200).json({
        valid: true,
        canInitiateCall: true,
        message: 'Token is valid',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Token validation error:', error);
      res.status(500).json({
        valid: false,
        canInitiateCall: false,
        error: 'Token validation failed',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get user's active tokens
   */
  getUserTokens = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const tokens = await this.tokenManager.getUserTokens(req.user.userId as any);

      // Return sanitized token information (no actual token values)
      const sanitizedTokens = tokens.map(token => ({
        tokenId: String(token.hashedToken).substring(0, 8) + '...',
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        isRevoked: token.isRevoked
      }));

      res.status(200).json({
        tokens: sanitizedTokens,
        count: sanitizedTokens.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get user tokens error:', error);
      res.status(500).json({
        error: 'Failed to retrieve tokens',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Revoke all user tokens
   */
  revokeAllTokens = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const revokedCount = await this.tokenManager.revokeAllUserTokens(req.user.userId as any);

      res.status(200).json({
        message: 'All tokens revoked successfully',
        revokedCount,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Revoke all tokens error:', error);
      res.status(500).json({
        error: 'Failed to revoke tokens',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Clean up expired tokens (admin endpoint)
   */
  cleanupExpiredTokens = async (req: Request, res: Response): Promise<void> => {
    try {
      const cleanedCount = await this.tokenManager.cleanupExpiredTokens();

      res.status(200).json({
        message: 'Expired tokens cleaned up',
        cleanedCount,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Token cleanup error:', error);
      res.status(500).json({
        error: 'Token cleanup failed',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Create token management routes
 */
export function createTokenRoutes(
  tokenManager: TokenManager,
  authService: AuthService
): Router {
  const router = Router();
  const tokenController = new TokenController(tokenManager);
  const authMiddleware = createAuthMiddleware(authService);

  // Generate new token (requires authentication)
  router.post('/generate',
    authMiddleware,
    rateLimitMiddleware('token_generate', 10, 60 * 60 * 1000), // 10 tokens per hour
    tokenController.generateToken
  );

  // Validate token (public endpoint with rate limiting)
  router.post('/validate',
    rateLimitMiddleware('token_validate', 100, 60 * 60 * 1000), // 100 validations per hour
    inputValidationMiddleware({
      token: { required: true, type: 'string', minLength: 10 }
    }),
    tokenController.validateToken
  );

  // Get user's tokens (requires authentication)
  router.get('/my-tokens',
    authMiddleware,
    rateLimitMiddleware('token_list', 20, 60 * 60 * 1000), // 20 requests per hour
    tokenController.getUserTokens
  );

  // Revoke all user tokens (requires authentication)
  router.post('/revoke-all',
    authMiddleware,
    rateLimitMiddleware('token_revoke', 5, 60 * 60 * 1000), // 5 revocations per hour
    tokenController.revokeAllTokens
  );

  // Admin endpoint for token cleanup (requires authentication)
  router.post('/cleanup',
    authMiddleware,
    rateLimitMiddleware('token_cleanup', 1, 60 * 60 * 1000), // 1 cleanup per hour
    tokenController.cleanupExpiredTokens
  );

  return router;
}

// Export configured router
export const tokenRoutes = createTokenRoutes;