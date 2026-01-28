/**
 * Authentication Routes
 * 
 * Express routes for authentication endpoints.
 */

import { Router } from 'express';
import { AuthController } from './authController';
import { UserController } from './userController';
import { AuthService } from './authService';
import { UserModel } from './userModel';
import { createAuthMiddleware, createOptionalAuthMiddleware } from './authMiddleware';

/**
 * Creates authentication routes
 */
export function createAuthRoutes(authService: AuthService, userModel: UserModel): Router {
  const router = Router();
  const authController = new AuthController(authService);
  const userController = new UserController(userModel);
  const authMiddleware = createAuthMiddleware(authService);
  const optionalAuthMiddleware = createOptionalAuthMiddleware(authService);

  // Public routes (no authentication required)
  router.post('/register', authController.register);
  router.post('/login', authController.login);

  // Protected routes (authentication required)
  router.post('/mfa/setup', authMiddleware, authController.setupMFA);
  router.post('/refresh', authMiddleware, authController.refreshSession);
  router.post('/logout', authMiddleware, authController.logout);
  router.post('/logout-all', authMiddleware, authController.logoutAll);
  router.get('/validate', authMiddleware, authController.validateSession);

  // User profile routes (authentication required)
  router.get('/profile', authMiddleware, userController.getProfile);
  router.put('/profile', authMiddleware, userController.updateProfile);
  router.delete('/profile', authMiddleware, userController.deleteProfile);
  router.get('/privacy-settings', authMiddleware, userController.getPrivacySettings);

  // Health check for auth service
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'authentication',
      timestamp: new Date().toISOString()
    });
  });

  return router;
}

/**
 * Authentication route configuration
 */
export interface AuthRouteConfig {
  readonly basePath: string;
  readonly enableCors: boolean;
  readonly enableRateLimit: boolean;
}

/**
 * Default authentication route configuration
 */
export const DEFAULT_AUTH_ROUTE_CONFIG: AuthRouteConfig = {
  basePath: '/api/v1/auth',
  enableCors: true,
  enableRateLimit: true
};