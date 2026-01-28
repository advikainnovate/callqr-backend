/**
 * Authentication Controller
 * 
 * HTTP request handlers for authentication endpoints.
 */

import { Request, Response } from 'express';
import { AuthService } from './authService';
import { UserRegistrationRequest, UserLoginRequest, AuthenticationError } from './types';
import { AuthenticatedRequest } from './authMiddleware';

/**
 * Authentication Controller class
 */
export class AuthController {
  private readonly authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  /**
   * User registration endpoint
   */
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const registrationRequest: UserRegistrationRequest = {
        email: req.body.email,
        password: req.body.password,
        emergencyContact: req.body.emergencyContact,
        vehicleNumber: req.body.vehicleNumber
      };

      // Validate required fields
      if (!registrationRequest.email || !registrationRequest.password) {
        res.status(400).json({
          error: 'Email and password are required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      const result = await this.authService.registerUser(registrationRequest, clientIp);

      res.status(201).json({
        message: 'User registered successfully',
        userId: result.userId,
        requiresMFA: result.requiresMFA,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Registration error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      const statusCode = this.getErrorStatusCode(errorMessage);

      res.status(statusCode).json({
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * User login endpoint
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const loginRequest: UserLoginRequest = {
        email: req.body.email,
        password: req.body.password,
        mfaCode: req.body.mfaCode
      };

      // Validate required fields
      if (!loginRequest.email || !loginRequest.password) {
        res.status(400).json({
          error: 'Email and password are required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('User-Agent') || 'unknown';

      const { result, session, token } = await this.authService.loginUser(
        loginRequest,
        clientIp,
        userAgent
      );

      if (!result.success) {
        const statusCode = this.getAuthErrorStatusCode(result.error);
        const response: any = {
          error: this.getAuthErrorMessage(result.error),
          timestamp: new Date().toISOString()
        };

        if (result.requiresMFA) {
          response.requiresMFA = true;
          response.userId = result.userId;
        }

        if (result.lockoutTime) {
          response.lockoutTime = result.lockoutTime;
        }

        res.status(statusCode).json(response);
        return;
      }

      res.status(200).json({
        message: 'Login successful',
        token,
        session: {
          sessionId: session!.sessionId,
          expiresAt: session!.expiresAt
        },
        user: {
          userId: result.userId
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Login error:', error);
      
      res.status(500).json({
        error: 'Login failed',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * MFA setup endpoint
   */
  setupMFA = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const userEmail = req.body.email;
      if (!userEmail) {
        res.status(400).json({
          error: 'Email is required for MFA setup',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const mfaSetup = await this.authService.setupMFA(req.user.userId, userEmail);

      res.status(200).json({
        message: 'MFA setup successful',
        qrCodeUrl: mfaSetup.qrCodeUrl,
        backupCodes: mfaSetup.backupCodes,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('MFA setup error:', error);
      
      res.status(500).json({
        error: 'MFA setup failed',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Session refresh endpoint
   */
  refreshSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const refreshResult = await this.authService.refreshSession(req.user.sessionId);
      if (!refreshResult) {
        res.status(401).json({
          error: 'Session refresh failed',
          timestamp: new Date().toISOString()
        });
        return;
      }

      res.status(200).json({
        message: 'Session refreshed successfully',
        token: refreshResult.token,
        session: {
          sessionId: refreshResult.session.sessionId,
          expiresAt: refreshResult.session.expiresAt
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Session refresh error:', error);
      
      res.status(500).json({
        error: 'Session refresh failed',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Logout endpoint
   */
  logout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const success = await this.authService.logout(req.user.sessionId);
      
      res.status(200).json({
        message: success ? 'Logout successful' : 'Session already terminated',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Logout error:', error);
      
      res.status(500).json({
        error: 'Logout failed',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Logout all sessions endpoint
   */
  logoutAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const terminatedCount = await this.authService.logoutAllSessions(req.user.userId);
      
      res.status(200).json({
        message: 'All sessions terminated',
        terminatedSessions: terminatedCount,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Logout all error:', error);
      
      res.status(500).json({
        error: 'Logout all failed',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Session validation endpoint
   */
  validateSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Invalid session',
          timestamp: new Date().toISOString()
        });
        return;
      }

      res.status(200).json({
        message: 'Session is valid',
        user: {
          userId: req.user.userId,
          sessionId: req.user.sessionId
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Session validation error:', error);
      
      res.status(500).json({
        error: 'Session validation failed',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Maps authentication errors to HTTP status codes
   */
  private getAuthErrorStatusCode(error?: AuthenticationError): number {
    switch (error) {
      case AuthenticationError.INVALID_CREDENTIALS:
        return 401;
      case AuthenticationError.ACCOUNT_LOCKED:
        return 423; // Locked
      case AuthenticationError.MFA_REQUIRED:
        return 200; // Not an error, just requires additional step
      case AuthenticationError.INVALID_MFA_CODE:
        return 401;
      case AuthenticationError.ACCOUNT_DISABLED:
        return 403;
      case AuthenticationError.RATE_LIMITED:
        return 429; // Too Many Requests
      default:
        return 401;
    }
  }

  /**
   * Maps authentication errors to user-friendly messages
   */
  private getAuthErrorMessage(error?: AuthenticationError): string {
    switch (error) {
      case AuthenticationError.INVALID_CREDENTIALS:
        return 'Invalid email or password';
      case AuthenticationError.ACCOUNT_LOCKED:
        return 'Account is temporarily locked due to too many failed attempts';
      case AuthenticationError.MFA_REQUIRED:
        return 'Multi-factor authentication required';
      case AuthenticationError.INVALID_MFA_CODE:
        return 'Invalid MFA code';
      case AuthenticationError.ACCOUNT_DISABLED:
        return 'Account is disabled';
      case AuthenticationError.RATE_LIMITED:
        return 'Too many attempts. Please try again later';
      default:
        return 'Authentication failed';
    }
  }

  /**
   * Maps general errors to HTTP status codes
   */
  private getErrorStatusCode(errorMessage: string): number {
    if (errorMessage.includes('already registered')) {
      return 409; // Conflict
    }
    if (errorMessage.includes('validation failed')) {
      return 400; // Bad Request
    }
    if (errorMessage.includes('rate limit')) {
      return 429; // Too Many Requests
    }
    return 400; // Default to Bad Request
  }
}