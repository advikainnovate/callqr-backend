/**
 * Authentication Routes
 * 
 * REST API endpoints for user authentication and authorization.
 * Implements secure authentication with rate limiting and validation.
 * 
 * Requirements: 10.1, 10.2
 */

import { Router } from 'express';
import { AuthController } from '../../auth/authController';
import { AuthService } from '../../auth/authService';
import { createAuthMiddleware, createOptionalAuthMiddleware } from '../../auth/authMiddleware';
import { inputValidationMiddleware } from '../middleware/inputValidation';
import { rateLimitMiddleware } from '../middleware/rateLimiting';

/**
 * Create authentication routes
 */
export function createAuthRoutes(authService: AuthService): Router {
  const router = Router();
  const authController = new AuthController(authService);
  const authMiddleware = createAuthMiddleware(authService);
  const optionalAuthMiddleware = createOptionalAuthMiddleware(authService);

  // User registration
  router.post('/register',
    rateLimitMiddleware('auth_register', 5, 15 * 60 * 1000), // 5 attempts per 15 minutes
    inputValidationMiddleware({
      email: { required: true, type: 'email' },
      password: { required: true, type: 'string', minLength: 8 },
      emergencyContact: { required: false, type: 'string', maxLength: 256 },
      vehicleNumber: { required: false, type: 'string', maxLength: 100 }
    }),
    authController.register
  );

  // User login
  router.post('/login',
    rateLimitMiddleware('auth_login', 10, 15 * 60 * 1000), // 10 attempts per 15 minutes
    inputValidationMiddleware({
      email: { required: true, type: 'email' },
      password: { required: true, type: 'string' },
      mfaCode: { required: false, type: 'string', length: 6 }
    }),
    authController.login
  );

  // MFA setup (requires authentication)
  router.post('/mfa/setup',
    authMiddleware,
    inputValidationMiddleware({
      email: { required: true, type: 'email' }
    }),
    authController.setupMFA
  );

  // Session refresh (requires authentication)
  router.post('/session/refresh',
    authMiddleware,
    authController.refreshSession
  );

  // Logout (requires authentication)
  router.post('/logout',
    authMiddleware,
    authController.logout
  );

  // Logout all sessions (requires authentication)
  router.post('/logout-all',
    authMiddleware,
    authController.logoutAll
  );

  // Session validation (requires authentication)
  router.get('/session/validate',
    authMiddleware,
    authController.validateSession
  );

  return router;
}

// Export configured router
export const authRoutes = createAuthRoutes;