/**
 * Rate Limiter for Authentication
 * 
 * Implements rate limiting to prevent brute force attacks and abuse.
 */

import { RateLimitConfig } from './types';

/**
 * Rate limit attempt record
 */
interface RateLimitRecord {
  readonly attempts: number;
  readonly firstAttempt: Date;
  readonly lastAttempt: Date;
  readonly lockedUntil?: Date;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remainingAttempts: number;
  readonly resetTime?: Date;
  readonly lockoutTime?: Date;
}

/**
 * Default rate limit configurations
 */
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  login: {
    maxAttempts: 5,
    windowMinutes: 15,
    lockoutMinutes: 30
  },
  registration: {
    maxAttempts: 3,
    windowMinutes: 60,
    lockoutMinutes: 60
  },
  mfa: {
    maxAttempts: 3,
    windowMinutes: 5,
    lockoutMinutes: 15
  },
  passwordReset: {
    maxAttempts: 3,
    windowMinutes: 60,
    lockoutMinutes: 120
  }
};

/**
 * Rate Limiter class
 */
export class RateLimiter {
  private readonly records: Map<string, RateLimitRecord> = new Map();
  private readonly configs: Map<string, RateLimitConfig> = new Map();

  constructor(configs: Record<string, RateLimitConfig> = DEFAULT_RATE_LIMITS) {
    // Store configurations
    for (const [key, config] of Object.entries(configs)) {
      this.configs.set(key, config);
    }

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Checks if an action is allowed for a given identifier
   */
  checkLimit(action: string, identifier: string): RateLimitResult {
    const config = this.configs.get(action);
    if (!config) {
      throw new Error(`Rate limit configuration not found for action: ${action}`);
    }

    const key = `${action}:${identifier}`;
    const record = this.records.get(key);
    const now = new Date();

    // If no record exists, allow the action
    if (!record) {
      return {
        allowed: true,
        remainingAttempts: config.maxAttempts - 1
      };
    }

    // Check if currently locked out
    if (record.lockedUntil && now < record.lockedUntil) {
      return {
        allowed: false,
        remainingAttempts: 0,
        lockoutTime: record.lockedUntil
      };
    }

    // Check if window has expired (reset attempts)
    const windowExpiry = new Date(
      record.firstAttempt.getTime() + (config.windowMinutes * 60 * 1000)
    );

    if (now > windowExpiry) {
      // Window expired, reset attempts
      return {
        allowed: true,
        remainingAttempts: config.maxAttempts - 1
      };
    }

    // Check if max attempts reached
    if (record.attempts >= config.maxAttempts) {
      const lockoutTime = new Date(now.getTime() + (config.lockoutMinutes * 60 * 1000));
      
      return {
        allowed: false,
        remainingAttempts: 0,
        lockoutTime
      };
    }

    // Allow the action
    return {
      allowed: true,
      remainingAttempts: config.maxAttempts - record.attempts - 1,
      resetTime: windowExpiry
    };
  }

  /**
   * Records an attempt for rate limiting
   */
  recordAttempt(action: string, identifier: string, success: boolean = false): void {
    const config = this.configs.get(action);
    if (!config) {
      throw new Error(`Rate limit configuration not found for action: ${action}`);
    }

    const key = `${action}:${identifier}`;
    const now = new Date();
    const existingRecord = this.records.get(key);

    // If successful attempt, clear the record
    if (success) {
      this.records.delete(key);
      return;
    }

    // If no existing record or window expired, create new record
    if (!existingRecord) {
      this.records.set(key, {
        attempts: 1,
        firstAttempt: now,
        lastAttempt: now
      });
      return;
    }

    // Check if window has expired
    const windowExpiry = new Date(
      existingRecord.firstAttempt.getTime() + (config.windowMinutes * 60 * 1000)
    );

    if (now > windowExpiry) {
      // Window expired, start new record
      this.records.set(key, {
        attempts: 1,
        firstAttempt: now,
        lastAttempt: now
      });
      return;
    }

    // Update existing record
    const newAttempts = existingRecord.attempts + 1;
    let lockedUntil: Date | undefined;

    // Check if max attempts reached, set lockout
    if (newAttempts >= config.maxAttempts) {
      lockedUntil = new Date(now.getTime() + (config.lockoutMinutes * 60 * 1000));
    }

    this.records.set(key, {
      attempts: newAttempts,
      firstAttempt: existingRecord.firstAttempt,
      lastAttempt: now,
      lockedUntil
    });
  }

  /**
   * Clears rate limit record for an identifier
   */
  clearRecord(action: string, identifier: string): void {
    const key = `${action}:${identifier}`;
    this.records.delete(key);
  }

  /**
   * Gets current rate limit status
   */
  getStatus(action: string, identifier: string): RateLimitResult {
    return this.checkLimit(action, identifier);
  }

  /**
   * Gets all active rate limit records (for monitoring)
   */
  getActiveRecords(): Array<{ key: string; record: RateLimitRecord }> {
    const now = new Date();
    const activeRecords: Array<{ key: string; record: RateLimitRecord }> = [];

    for (const [key, record] of this.records) {
      // Include records that are still within window or locked out
      const [action] = key.split(':');
      const config = this.configs.get(action);
      
      if (!config) continue;

      const windowExpiry = new Date(
        record.firstAttempt.getTime() + (config.windowMinutes * 60 * 1000)
      );

      const isWithinWindow = now <= windowExpiry;
      const isLockedOut = record.lockedUntil && now < record.lockedUntil;

      if (isWithinWindow || isLockedOut) {
        activeRecords.push({ key, record });
      }
    }

    return activeRecords;
  }

  /**
   * Starts periodic cleanup of expired records
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredRecords();
    }, 10 * 60 * 1000); // Run every 10 minutes
  }

  /**
   * Cleans up expired rate limit records
   */
  private cleanupExpiredRecords(): void {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, record] of this.records) {
      const [action] = key.split(':');
      const config = this.configs.get(action);
      
      if (!config) {
        expiredKeys.push(key);
        continue;
      }

      // Check if window has expired and not locked out
      const windowExpiry = new Date(
        record.firstAttempt.getTime() + (config.windowMinutes * 60 * 1000)
      );

      const windowExpired = now > windowExpiry;
      const lockoutExpired = !record.lockedUntil || now > record.lockedUntil;

      if (windowExpired && lockoutExpired) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.records.delete(key);
    }

    if (expiredKeys.length > 0) {
      console.log(`Cleaned up ${expiredKeys.length} expired rate limit records`);
    }
  }
}