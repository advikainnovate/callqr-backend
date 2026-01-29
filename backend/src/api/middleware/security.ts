/**
 * Security Middleware
 * 
 * Additional security middleware for API protection including
 * CSRF protection, request sanitization, and security headers.
 * 
 * Requirements: 10.3
 */

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * CSRF protection middleware
 */
export function csrfProtectionMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF for GET, HEAD, OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    // Skip CSRF for API endpoints using Bearer tokens
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return next();
    }

    // Check for CSRF token in headers or body
    const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
    const sessionCsrf = (req as any).session?.csrfToken;

    if (!csrfToken || !sessionCsrf || csrfToken !== sessionCsrf) {
      return res.status(403).json({
        error: 'CSRF token validation failed',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
}

/**
 * Generate CSRF token
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * SQL injection protection middleware
 */
export function sqlInjectionProtectionMiddleware() {
  const suspiciousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
    /(--|\/\*|\*\/)/,
    /(\b(SCRIPT|JAVASCRIPT|VBSCRIPT)\b)/i,
    /(<script|<\/script>)/i
  ];

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const checkValue = (value: any): boolean => {
        if (typeof value === 'string') {
          return suspiciousPatterns.some(pattern => pattern.test(value));
        }
        if (Array.isArray(value)) {
          return value.some(checkValue);
        }
        if (typeof value === 'object' && value !== null) {
          return Object.values(value).some(checkValue);
        }
        return false;
      };

      // Check request body
      if (req.body && checkValue(req.body)) {
        return res.status(400).json({
          error: 'Potentially malicious input detected',
          timestamp: new Date().toISOString()
        });
      }

      // Check query parameters
      if (req.query && checkValue(req.query)) {
        return res.status(400).json({
          error: 'Potentially malicious query parameters detected',
          timestamp: new Date().toISOString()
        });
      }

      // Check URL parameters
      if (req.params && checkValue(req.params)) {
        return res.status(400).json({
          error: 'Potentially malicious URL parameters detected',
          timestamp: new Date().toISOString()
        });
      }

      next();
    } catch (error) {
      console.error('SQL injection protection error:', error);
      return res.status(500).json({
        error: 'Security validation failed',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * XSS protection middleware
 */
export function xssProtectionMiddleware() {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<img[^>]+src[^>]*>/gi,
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi
  ];

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const sanitizeValue = (value: any): any => {
        if (typeof value === 'string') {
          let sanitized = value;
          xssPatterns.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '');
          });
          return sanitized;
        }
        if (Array.isArray(value)) {
          return value.map(sanitizeValue);
        }
        if (typeof value === 'object' && value !== null) {
          const sanitized: any = {};
          for (const [key, val] of Object.entries(value)) {
            sanitized[key] = sanitizeValue(val);
          }
          return sanitized;
        }
        return value;
      };

      // Sanitize request body
      if (req.body) {
        req.body = sanitizeValue(req.body);
      }

      // Sanitize query parameters
      if (req.query) {
        req.query = sanitizeValue(req.query);
      }

      next();
    } catch (error) {
      console.error('XSS protection error:', error);
      return res.status(500).json({
        error: 'XSS protection failed',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Request logging middleware for security monitoring
 */
export function securityLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    // Add request ID to request object
    (req as any).requestId = requestId;

    // Log request details (sanitized)
    const logData = {
      requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length')
    };

    console.log('API Request:', JSON.stringify(logData));

    // Log response details
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const responseLog = {
        requestId,
        statusCode: res.statusCode,
        duration,
        timestamp: new Date().toISOString()
      };

      // Log security-relevant status codes
      if (res.statusCode >= 400) {
        console.log('API Error Response:', JSON.stringify(responseLog));
      }
    });

    next();
  };
}

/**
 * IP whitelist middleware
 */
export function ipWhitelistMiddleware(allowedIPs: string[] = []) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (allowedIPs.length === 0) {
      return next(); // No whitelist configured
    }

    const clientIP = req.ip || req.connection.remoteAddress || '';
    
    if (!allowedIPs.includes(clientIP)) {
      console.log(`Blocked request from IP: ${clientIP}`);
      return res.status(403).json({
        error: 'Access denied',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
}

/**
 * Request timeout middleware
 */
export function requestTimeoutMiddleware(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request timeout',
          timeout: timeoutMs,
          timestamp: new Date().toISOString()
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
}

/**
 * Request ID middleware
 */
export function requestIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = crypto.randomUUID();
    (req as any).requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  };
}

/**
 * Security headers middleware
 */
export function securityHeadersMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Content Security Policy
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");
    
    // Permissions Policy
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // HSTS (only for HTTPS)
    if (req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    next();
  };
}

/**
 * API key validation middleware
 */
export function apiKeyValidationMiddleware(validApiKeys: string[] = []) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (validApiKeys.length === 0) {
      return next(); // No API key validation configured
    }

    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey || !validApiKeys.includes(apiKey)) {
      return res.status(401).json({
        error: 'Invalid or missing API key',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
}

/**
 * Request size limit middleware
 */
export function requestSizeLimitMiddleware(maxSizeBytes: number = 1024 * 1024) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength && parseInt(contentLength) > maxSizeBytes) {
      return res.status(413).json({
        error: 'Request entity too large',
        maxSize: maxSizeBytes,
        actualSize: parseInt(contentLength),
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
}