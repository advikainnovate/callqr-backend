import { Socket } from 'socket.io';
import { logger } from '../utils';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Socket.IO Rate Limiter
 * Tracks event counts per user within time windows
 */
export class SocketRateLimiter {
  private limits: Map<string, Map<string, RateLimitEntry>> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Create rate limit middleware for specific events
   */
  createLimiter(eventName: string, config: RateLimitConfig) {
    return async (socket: Socket & { userId?: string }, _data: unknown, next: (err?: Error) => void) => {
      const userId = socket.userId || socket.id;
      const key = `${userId}:${eventName}`;

      if (!this.limits.has(eventName)) {
        this.limits.set(eventName, new Map());
      }

      const eventLimits = this.limits.get(eventName)!;
      const now = Date.now();
      const entry = eventLimits.get(key);

      if (!entry || now > entry.resetTime) {
        // New window or expired
        eventLimits.set(key, {
          count: 1,
          resetTime: now + config.windowMs,
        });
        return next();
      }

      if (entry.count >= config.maxRequests) {
        // Rate limit exceeded
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        logger.warn(
          `Rate limit exceeded for user ${userId} on event ${eventName}. ` +
          `Count: ${entry.count}/${config.maxRequests}`
        );

        socket.emit('rate-limit-exceeded', {
          event: eventName,
          message: config.message || 'Too many requests. Please slow down.',
          retryAfter,
        });

        return next(new Error('Rate limit exceeded'));
      }

      // Increment counter
      entry.count++;
      return next();
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [eventName, eventLimits] of this.limits.entries()) {
      for (const [key, entry] of eventLimits.entries()) {
        if (now > entry.resetTime) {
          eventLimits.delete(key);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
    }
  }

  /**
   * Get current usage for a user/event
   */
  getUsage(userId: string, eventName: string): { count: number; limit: number; resetTime: number } | null {
    const eventLimits = this.limits.get(eventName);
    if (!eventLimits) return null;

    const key = `${userId}:${eventName}`;
    const entry = eventLimits.get(key);
    if (!entry) return null;

    return {
      count: entry.count,
      limit: 0, // Would need to store config to return this
      resetTime: entry.resetTime,
    };
  }

  /**
   * Reset limits for a specific user/event
   */
  reset(userId: string, eventName?: string) {
    if (eventName) {
      const eventLimits = this.limits.get(eventName);
      if (eventLimits) {
        const key = `${userId}:${eventName}`;
        eventLimits.delete(key);
      }
    } else {
      // Reset all events for user
      for (const eventLimits of this.limits.values()) {
        for (const key of eventLimits.keys()) {
          if (key.startsWith(`${userId}:`)) {
            eventLimits.delete(key);
          }
        }
      }
    }
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.limits.clear();
  }
}

/**
 * Pre-configured rate limit profiles
 */
export const rateLimitProfiles = {
  // WebRTC signaling - moderate limits (offers/answers/ICE)
  signaling: {
    windowMs: 60000, // 1 minute
    maxRequests: 100, // 100 signals per minute
    message: 'Too many signaling requests. Please wait before retrying.',
  },

  // Call actions - strict limits
  callAction: {
    windowMs: 60000, // 1 minute
    maxRequests: 20, // 20 call actions per minute
    message: 'Too many call requests. Please wait before retrying.',
  },

  // Chat messages - moderate limits
  chatMessage: {
    windowMs: 60000, // 1 minute
    maxRequests: 30, // 30 messages per minute
    message: 'You are sending messages too quickly. Please slow down.',
  },

  // Typing indicators - lenient but still limited
  typing: {
    windowMs: 10000, // 10 seconds
    maxRequests: 20, // 20 typing events per 10 seconds
    message: 'Too many typing events.',
  },

  // Chat room actions - moderate
  chatRoom: {
    windowMs: 60000, // 1 minute
    maxRequests: 30, // 30 room actions per minute
    message: 'Too many chat room actions. Please slow down.',
  },

  // Read receipts - lenient
  readReceipt: {
    windowMs: 60000, // 1 minute
    maxRequests: 50, // 50 read receipts per minute
    message: 'Too many read receipt requests.',
  },
};

/**
 * Connection rate limiter (per IP)
 */
export class ConnectionRateLimiter {
  private connections: Map<string, { count: number; resetTime: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private maxConnectionsPerWindow: number = 10,
    private windowMs: number = 60000 // 1 minute
  ) {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if connection is allowed
   */
  allowConnection(ip: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = this.connections.get(ip);

    if (!entry || now > entry.resetTime) {
      // New window
      this.connections.set(ip, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return { allowed: true };
    }

    if (entry.count >= this.maxConnectionsPerWindow) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      logger.warn(`Connection rate limit exceeded for IP: ${ip}`);
      return { allowed: false, retryAfter };
    }

    entry.count++;
    return { allowed: true };
  }

  private cleanup() {
    const now = Date.now();
    for (const [ip, entry] of this.connections.entries()) {
      if (now > entry.resetTime) {
        this.connections.delete(ip);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.connections.clear();
  }
}
