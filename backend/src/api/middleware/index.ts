/**
 * Middleware Index
 * 
 * Central export for all API middleware components.
 * Provides easy access to validation, security, and rate limiting middleware.
 * 
 * Requirements: 10.3
 */

// Input validation middleware
export {
  inputValidationMiddleware,
  queryValidationMiddleware,
  validateInput,
  sanitizeInput,
  securitySanitizationMiddleware,
  contentTypeValidationMiddleware,
  requestSizeValidationMiddleware
} from './inputValidation';

// Rate limiting middleware
export {
  rateLimitMiddleware,
  tieredRateLimitMiddleware,
  userRateLimitMiddleware,
  slidingWindowRateLimitMiddleware,
  getRateLimitStats,
  clearRateLimitData,
  destroyRateLimitStore
} from './rateLimiting';

// Security middleware
export {
  csrfProtectionMiddleware,
  generateCSRFToken,
  sqlInjectionProtectionMiddleware,
  xssProtectionMiddleware,
  securityLoggingMiddleware,
  ipWhitelistMiddleware,
  requestTimeoutMiddleware,
  requestIdMiddleware,
  securityHeadersMiddleware,
  apiKeyValidationMiddleware,
  requestSizeLimitMiddleware
} from './security';

/**
 * Create standard middleware stack for API endpoints
 */
export function createStandardMiddlewareStack() {
  const {
    requestIdMiddleware,
    securityHeadersMiddleware,
    requestTimeoutMiddleware,
    requestSizeLimitMiddleware,
    securitySanitizationMiddleware,
    sqlInjectionProtectionMiddleware,
    xssProtectionMiddleware,
    securityLoggingMiddleware
  } = require('./security');

  const { securitySanitizationMiddleware: inputSanitization } = require('./inputValidation');

  return [
    requestIdMiddleware(),
    securityHeadersMiddleware(),
    requestTimeoutMiddleware(30000), // 30 second timeout
    requestSizeLimitMiddleware(1024 * 1024), // 1MB limit
    inputSanitization(),
    sqlInjectionProtectionMiddleware(),
    xssProtectionMiddleware(),
    securityLoggingMiddleware()
  ];
}

/**
 * Create authentication middleware stack
 */
export function createAuthMiddlewareStack() {
  const { rateLimitMiddleware } = require('./rateLimiting');
  
  return [
    ...createStandardMiddlewareStack(),
    rateLimitMiddleware('auth_general', 100, 60 * 60 * 1000) // 100 requests per hour
  ];
}

/**
 * Create public API middleware stack
 */
export function createPublicApiMiddlewareStack() {
  const { rateLimitMiddleware } = require('./rateLimiting');
  
  return [
    ...createStandardMiddlewareStack(),
    rateLimitMiddleware('public_api', 1000, 60 * 60 * 1000) // 1000 requests per hour
  ];
}

/**
 * Create admin middleware stack
 */
export function createAdminMiddlewareStack() {
  const { rateLimitMiddleware } = require('./rateLimiting');
  
  return [
    ...createStandardMiddlewareStack(),
    rateLimitMiddleware('admin_api', 50, 60 * 60 * 1000) // 50 requests per hour
  ];
}