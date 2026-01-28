/**
 * Rate Limiting Middleware
 * 
 * Implements rate limiting and abuse prevention for API endpoints.
 * Provides protection against brute force attacks and API abuse.
 * 
 * Requirements: 10.3
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Rate limit configuration interface
 */
export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Maximum requests per window
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
  headers?: boolean;
}

/**
 * Rate limit entry interface
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
}

/**
 * In-memory rate limit store
 * In production, this should be replaced with Redis or similar
 */
class MemoryRateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Get rate limit entry for key
   */
  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }

  /**
   * Set rate limit entry for key
   */
  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  /**
   * Increment counter for key
   */
  increment(key: string, windowMs: number): RateLimitEntry {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now > existing.resetTime) {
      // Create new entry or reset expired entry
      const entry: RateLimitEntry = {
        count: 1,
        resetTime: now + windowMs,
        firstRequest: now
      };
      this.store.set(key, entry);
      return entry;
    }

    // Increment existing entry
    existing.count++;
    this.store.set(key, existing);
    return existing;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get store statistics
   */
  getStats(): { totalKeys: number; activeKeys: number } {
    const now = Date.now();
    let activeKeys = 0;

    for (const entry of this.store.values()) {
      if (now <= entry.resetTime) {
        activeKeys++;
      }
    }

    return {
      totalKeys: this.store.size,
      activeKeys
    };
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Destroy store and cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Global rate limit store instance
const rateLimitStore = new MemoryRateLimitStore();

/**
 * Default key generator using IP address
 */
function defaultKeyGenerator(req: Request): string {
  return req.ip || req.connection.remoteAddress || 'unknown';
}

/**
 * Rate limiting middleware factory
 */
export function rateLimitMiddleware(
  identifier: string,
  maxRequests: number,
  windowMs: number,
  options: Partial<RateLimitConfig> = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const config: RateLimitConfig = {
    windowMs,
    maxRequests,
    keyGenerator: defaultKeyGenerator,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    message: 'Too many requests, please try again later',
    headers: true,
    ...options
  };

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = `${identifier}:${config.keyGenerator!(req)}`;
      const entry = rateLimitStore.increment(key, config.windowMs);

      // Set rate limit headers
      if (config.headers) {
        res.set({
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': Math.max(0, config.maxRequests - entry.count).toString(),
          'X-RateLimit-Reset': new Date(entry.resetTime).toISOString()
        });
      }

      // Check if rate limit exceeded
      if (entry.count > config.maxRequests) {
        const retryAfter = Math.ceil((entry.resetTime - Date.now()) / 1000);
        
        res.set('Retry-After', retryAfter.toString());
        
        return res.status(429).json({
          error: config.message,
          retryAfter,
          limit: config.maxRequests,
          windowMs: config.windowMs,
          timestamp: new Date().toISOString()
        });
      }

      // Handle response tracking for skip options
      if (config.skipSuccessfulRequests || config.skipFailedRequests) {
        const originalSend = res.send;
        res.send = function(body) {
          const statusCode = res.statusCode;
          
          // Decrement counter if we should skip this request
          if ((config.skipSuccessfulRequests && statusCode < 400) ||
              (config.skipFailedRequests && statusCode >= 400)) {
            const currentEntry = rateLimitStore.get(key);
            if (currentEntry && currentEntry.count > 0) {
              currentEntry.count--;
              rateLimitStore.set(key, currentEntry);
            }
          }
          
          return originalSend.call(this, body);
        };
      }

      next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      // Continue without rate limiting on error
      next();
    }
  };
}

/**
 * Advanced rate limiting with multiple tiers
 */
export function tieredRateLimitMiddleware(
  identifier: string,
  tiers: Array<{ maxRequests: number; windowMs: number; message?: string }>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientKey = defaultKeyGenerator(req);
      
      // Check each tier
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const key = `${identifier}:tier${i}:${clientKey}`;
        const entry = rateLimitStore.increment(key, tier.windowMs);

        if (entry.count > tier.maxRequests) {
          const retryAfter = Math.ceil((entry.resetTime - Date.now()) / 1000);
          
          res.set({
            'X-RateLimit-Limit': tier.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
            'Retry-After': retryAfter.toString()
          });
          
          return res.status(429).json({
            error: tier.message || 'Rate limit exceeded',
            tier: i + 1,
            retryAfter,
            timestamp: new Date().toISOString()
          });
        }
      }

      next();
    } catch (error) {
      console.error('Tiered rate limiting error:', error);
      next();
    }
  };
}

/**
 * User-specific rate limiting (requires authentication)
 */
export function userRateLimitMiddleware(
  identifier: string,
  maxRequests: number,
  windowMs: number
): (req: any, res: Response, next: NextFunction) => void {
  return (req: any, res: Response, next: NextFunction) => {
    try {
      // Use user ID if authenticated, otherwise fall back to IP
      const userId = req.user?.userId;
      const clientKey = userId || defaultKeyGenerator(req);
      const key = `${identifier}:user:${clientKey}`;
      
      const entry = rateLimitStore.increment(key, windowMs);

      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, maxRequests - entry.count).toString(),
        'X-RateLimit-Reset': new Date(entry.resetTime).toISOString()
      });

      if (entry.count > maxRequests) {
        const retryAfter = Math.ceil((entry.resetTime - Date.now()) / 1000);
        
        res.set('Retry-After', retryAfter.toString());
        
        return res.status(429).json({
          error: 'User rate limit exceeded',
          retryAfter,
          timestamp: new Date().toISOString()
        });
      }

      next();
    } catch (error) {
      console.error('User rate limiting error:', error);
      next();
    }
  };
}

/**
 * Sliding window rate limiter
 */
export function slidingWindowRateLimitMiddleware(
  identifier: string,
  maxRequests: number,
  windowMs: number
): (req: Request, res: Response, next: NextFunction) => void {
  const requestTimes = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = `${identifier}:${defaultKeyGenerator(req)}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Get existing request times for this key
      let times = requestTimes.get(key) || [];
      
      // Remove requests outside the window
      times = times.filter(time => time > windowStart);
      
      // Check if adding this request would exceed the limit
      if (times.length >= maxRequests) {
        const oldestRequest = Math.min(...times);
        const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);
        
        res.set({
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(oldestRequest + windowMs).toISOString(),
          'Retry-After': retryAfter.toString()
        });
        
        return res.status(429).json({
          error: 'Rate limit exceeded',
          retryAfter,
          timestamp: new Date().toISOString()
        });
      }

      // Add current request time
      times.push(now);
      requestTimes.set(key, times);

      // Set headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': (maxRequests - times.length).toString(),
        'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
      });

      next();
    } catch (error) {
      console.error('Sliding window rate limiting error:', error);
      next();
    }
  };
}

/**
 * Get rate limiting statistics
 */
export function getRateLimitStats(): { totalKeys: number; activeKeys: number } {
  return rateLimitStore.getStats();
}

/**
 * Clear rate limiting data (for testing)
 */
export function clearRateLimitData(): void {
  rateLimitStore.clear();
}

/**
 * Destroy rate limiting store
 */
export function destroyRateLimitStore(): void {
  rateLimitStore.destroy();
}