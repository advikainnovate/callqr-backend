/**
 * Authentication Middleware
 * 
 * Express middleware for handling authentication and authorization.
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from './authService';
import { UserId } from '../utils/types';

/**
 * Extended Request interface with user information
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: UserId;
    sessionId: string;
  };
}

/**
 * Authentication middleware factory
 */
export function createAuthMiddleware(authService: AuthService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Validate session
      const sessionResult = await authService.validateSession(token);
      if (!sessionResult.isValid || !sessionResult.session) {
        return res.status(401).json({
          error: 'Invalid or expired session',
          timestamp: new Date().toISOString()
        });
      }

      // Add user information to request
      req.user = {
        userId: sessionResult.session.userId,
        sessionId: sessionResult.session.sessionId
      };

      // Handle session refresh if needed
      if (sessionResult.needsRefresh) {
        const refreshResult = await authService.refreshSession(sessionResult.session.sessionId);
        if (refreshResult) {
          // Add new token to response headers
          res.setHeader('X-New-Token', refreshResult.token);
        }
      }

      next();
    } catch (error) {
      console.error('Authentication middleware error:', error);
      return res.status(500).json({
        error: 'Authentication error',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Optional authentication middleware (doesn't fail if no token provided)
 */
export function createOptionalAuthMiddleware(authService: AuthService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No authentication provided, continue without user info
        return next();
      }

      const token = authHeader.substring(7);
      const sessionResult = await authService.validateSession(token);
      
      if (sessionResult.isValid && sessionResult.session) {
        req.user = {
          userId: sessionResult.session.userId,
          sessionId: sessionResult.session.sessionId
        };

        // Handle session refresh if needed
        if (sessionResult.needsRefresh) {
          const refreshResult = await authService.refreshSession(sessionResult.session.sessionId);
          if (refreshResult) {
            res.setHeader('X-New-Token', refreshResult.token);
          }
        }
      }

      next();
    } catch (error) {
      console.error('Optional authentication middleware error:', error);
      // Continue without authentication on error
      next();
    }
  };
}

/**
 * Rate limiting middleware factory
 */
export function createRateLimitMiddleware(
  action: string,
  getIdentifier: (req: Request) => string,
  authService: AuthService
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const identifier = getIdentifier(req);
      
      // Note: Rate limiting is handled within AuthService
      // This middleware is a placeholder for additional rate limiting if needed
      next();
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      return res.status(500).json({
        error: 'Rate limiting error',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * CORS middleware with authentication considerations
 */
export function createAuthCorsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Allow credentials for authentication
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // Allow authentication headers
    const allowedHeaders = [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-New-Token'
    ];
    
    res.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    
    // Expose new token header to client
    res.header('Access-Control-Expose-Headers', 'X-New-Token');
    
    next();
  };
}

/**
 * Security headers middleware
 */
export function createSecurityHeadersMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Prevent clickjacking
    res.header('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    res.header('X-Content-Type-Options', 'nosniff');
    
    // Enable XSS protection
    res.header('X-XSS-Protection', '1; mode=block');
    
    // Strict transport security (HTTPS only)
    if (req.secure) {
      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    // Content security policy
    res.header('Content-Security-Policy', "default-src 'self'");
    
    next();
  };
}

/**
 * Request logging middleware for security monitoring
 */
export function createSecurityLoggingMiddleware() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Log security-relevant information
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      userId: req.user?.userId,
      sessionId: req.user?.sessionId
    };

    // Log authentication attempts
    if (req.path.includes('/auth/')) {
      console.log('Auth request:', JSON.stringify(logData));
    }

    // Log response time and status
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      console.log(`Request completed: ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });

    next();
  };
}