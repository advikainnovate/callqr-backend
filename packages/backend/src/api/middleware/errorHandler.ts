/**
 * Error handling middleware for Express.js
 * 
 * Provides centralized error handling with privacy compliance and user-friendly responses.
 */

import { Request, Response, NextFunction } from 'express';
import { ErrorHandler, PrivacyError, ErrorSeverity } from '../../utils/errors';
import { logger } from '../../utils/logger';

// Express error handling middleware
export function errorHandlerMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Handle the error using our privacy-compliant error handler
  const privacyError = ErrorHandler.handle(error, {
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Check if this should trigger a security alert
  if (ErrorHandler.shouldTriggerSecurityAlert(privacyError)) {
    logger.error('SECURITY ALERT: Critical error detected', {
      code: privacyError.code,
      category: privacyError.category,
      severity: privacyError.severity,
      path: req.path,
      method: req.method,
      ip: req.ip
    });
  }

  // Determine HTTP status code based on error type
  const statusCode = getHttpStatusCode(privacyError);

  // Send privacy-compliant error response
  const errorResponse = ErrorHandler.getErrorResponse(privacyError);
  
  res.status(statusCode).json(errorResponse);
}

// Map error categories to HTTP status codes
function getHttpStatusCode(error: PrivacyError): number {
  switch (error.category) {
    case 'TOKEN_ERROR':
      if (error.code === 'TOKEN_NOT_FOUND' || error.code === 'TOKEN_EXPIRED') {
        return 404; // Not Found
      }
      return 400; // Bad Request
    
    case 'AUTHENTICATION_ERROR':
      if (error.code === 'SESSION_EXPIRED') {
        return 401; // Unauthorized
      }
      if (error.code === 'INVALID_CREDENTIALS' || error.code === 'MFA_FAILURE') {
        return 401; // Unauthorized
      }
      return 403; // Forbidden
    
    case 'PERMISSION_ERROR':
      return 403; // Forbidden
    
    case 'VALIDATION_ERROR':
      return 400; // Bad Request
    
    case 'RATE_LIMIT_ERROR':
      return 429; // Too Many Requests
    
    case 'NETWORK_ERROR':
      return 503; // Service Unavailable
    
    case 'SYSTEM_ERROR':
      if (error.severity === ErrorSeverity.CRITICAL) {
        return 500; // Internal Server Error
      }
      if (error.code === 'SERVICE_UNAVAILABLE') {
        return 503; // Service Unavailable
      }
      return 500; // Internal Server Error
    
    case 'CALL_SETUP_ERROR':
      if (error.code === 'USER_OFFLINE') {
        return 404; // Not Found
      }
      return 503; // Service Unavailable
    
    default:
      return 500; // Internal Server Error
  }
}

// Async error wrapper for route handlers
export function asyncErrorHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Not found handler
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    timestamp: new Date().toISOString(),
    retryable: false
  });
}

// Request timeout handler
export function timeoutHandler(timeout: number = 30000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request timeout. Please try again.',
          code: 'REQUEST_TIMEOUT',
          timestamp: new Date().toISOString(),
          retryable: true
        });
      }
    }, timeout);

    // Clear timeout when response is sent
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
}

// Health check error handler
export function healthCheckErrorHandler(error: Error): {
  status: 'unhealthy';
  error: string;
  timestamp: string;
} {
  const privacyError = ErrorHandler.handle(error);
  
  return {
    status: 'unhealthy',
    error: privacyError.userMessage,
    timestamp: new Date().toISOString()
  };
}