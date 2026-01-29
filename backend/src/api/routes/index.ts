/**
 * API Routes Index
 * 
 * Central routing configuration for all API endpoints.
 * Implements secure REST API endpoints with authentication and authorization.
 * 
 * Requirements: 10.1, 10.2
 */

import { Router } from 'express';
import { createAuthRoutes } from './authRoutes';
import { createTokenRoutes } from './tokenRoutes';
import { createCallRoutes } from './callRoutes';
import { AuthService } from '../../auth/authService';
import { TokenManager } from '../../security/tokenManager';
import { CallRouter } from '../../routing/callRouter';

/**
 * Create main API router with all route modules
 */
export function createApiRouter(
  authService: AuthService,
  tokenManager: TokenManager,
  callRouter: CallRouter
): Router {
  const router = Router();

  // API version prefix
  const v1Router = Router();

  // Mount route modules with dependencies
  v1Router.use('/auth', createAuthRoutes(authService));
  v1Router.use('/tokens', createTokenRoutes(tokenManager, authService));
  v1Router.use('/calls', createCallRoutes(callRouter, tokenManager, authService));

  // Health check for API
  v1Router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      service: 'privacy-qr-calling-api'
    });
  });

  // Mount v1 routes
  router.use('/v1', v1Router);

  return router;
}