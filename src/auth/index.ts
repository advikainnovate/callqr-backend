/**
 * Authentication Module
 * 
 * Main exports for the authentication system.
 */

// Core services
export { AuthService, AuthServiceConfig, UserStorage, UserProfileData } from './authService';
export { SessionManager, SessionConfig, CreateSessionRequest } from './sessionManager';
export { MFAManager, TOTPConfig } from './mfaManager';
export { RateLimiter, RateLimitResult } from './rateLimiter';

// Database layer
export { PostgreSQLUserStorage, DatabaseConfig } from './userStorage';
export { getDatabaseConfig, createUserStorage, checkDatabaseHealth } from './database';

// User model
export { UserModel, UserProfile, UserProfileUpdateRequest } from './userModel';

// Utilities
export { validatePassword, PasswordValidationResult, PasswordStrength } from './passwordValidator';
export { hashPassword, verifyPassword, PasswordHashResult } from './passwordHasher';

// Middleware
export { 
  createAuthMiddleware, 
  createOptionalAuthMiddleware, 
  createRateLimitMiddleware,
  createAuthCorsMiddleware,
  createSecurityHeadersMiddleware,
  createSecurityLoggingMiddleware,
  AuthenticatedRequest 
} from './authMiddleware';

// Controllers and routes
export { AuthController } from './authController';
export { UserController } from './userController';
export { createAuthRoutes, AuthRouteConfig, DEFAULT_AUTH_ROUTE_CONFIG } from './authRoutes';

// Types
export * from './types';