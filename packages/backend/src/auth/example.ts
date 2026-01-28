/**
 * Authentication System Integration Example
 * 
 * Shows how to set up and use the complete authentication system
 * with user registration, login, MFA, and profile management.
 */

import express from 'express';
import { 
  AuthService, 
  createUserStorage, 
  UserModel,
  createAuthRoutes,
  createSecurityHeadersMiddleware,
  createSecurityLoggingMiddleware
} from './index';

/**
 * Example setup function for authentication system
 */
export async function setupAuthenticationSystem(): Promise<express.Router> {
  // Create database storage
  const userStorage = createUserStorage();

  // Configure authentication service
  const authService = new AuthService(
    {
      sessionConfig: {
        jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
        sessionDurationHours: 24,
        maxConcurrentSessions: 5,
        refreshThresholdHours: 2
      },
      requireMFA: process.env.REQUIRE_MFA === 'true',
      passwordPepper: process.env.PASSWORD_PEPPER
    },
    userStorage
  );

  // Create user model for profile management
  const userModel = new UserModel(userStorage);

  // Create authentication routes
  const authRoutes = createAuthRoutes(authService, userModel);

  // Apply security middleware
  const router = express.Router();
  router.use(createSecurityHeadersMiddleware());
  router.use(createSecurityLoggingMiddleware());
  router.use('/auth', authRoutes);

  return router;
}

/**
 * Example usage in main application
 */
export async function exampleUsage() {
  const app = express();
  
  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Set up authentication
  const authRouter = await setupAuthenticationSystem();
  app.use('/api/v1', authRouter);

  // Example protected route
  app.get('/api/v1/protected', async (req, res) => {
    // This would use the auth middleware
    res.json({ message: 'This is a protected route' });
  });

  return app;
}

/**
 * Example environment configuration
 */
export const exampleEnvConfig = {
  // Database configuration
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_NAME: 'privacy_qr_calling',
  DB_USER: 'postgres',
  DB_PASSWORD: 'password',
  DB_SSL: 'false',

  // Authentication configuration
  JWT_SECRET: 'your-super-secret-jwt-key-change-in-production',
  PASSWORD_PEPPER: 'additional-password-security-salt',
  REQUIRE_MFA: 'true',

  // Encryption configuration
  USER_DATA_ENCRYPTION_KEY: 'your-encryption-key-for-sensitive-data'
};

/**
 * Example API usage patterns
 */
export const exampleAPIUsage = {
  // User registration
  register: {
    method: 'POST',
    url: '/api/v1/auth/register',
    body: {
      email: 'user@example.com',
      password: 'SecurePassword123!',
      emergencyContact: '+1234567890',
      vehicleNumber: 'ABC123'
    }
  },

  // User login
  login: {
    method: 'POST',
    url: '/api/v1/auth/login',
    body: {
      email: 'user@example.com',
      password: 'SecurePassword123!',
      mfaCode: '123456' // If MFA is enabled
    }
  },

  // Get user profile
  getProfile: {
    method: 'GET',
    url: '/api/v1/auth/profile',
    headers: {
      'Authorization': 'Bearer <jwt-token>'
    }
  },

  // Update user profile
  updateProfile: {
    method: 'PUT',
    url: '/api/v1/auth/profile',
    headers: {
      'Authorization': 'Bearer <jwt-token>'
    },
    body: {
      emergencyContact: '+1987654321',
      vehicleNumber: 'XYZ789'
    }
  }
};