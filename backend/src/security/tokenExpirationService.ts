/**
 * Token Expiration Service
 * 
 * Manages token lifecycle, expiration, and revocation for the privacy-preserving
 * QR-based calling system with automatic cleanup and security monitoring.
 * 
 * Requirements: 5.3, 5.4
 */

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { SecureToken, TokenMetadata, UserId, HashedToken } from './types';
import { TokenHasher } from './tokenHasher';

/**
 * Token expiration policy configuration
 */
export interface TokenExpirationPolicy {
  readonly defaultExpirationHours: number;
  readonly maxTokenLifetimeHours: number;
  readonly cleanupIntervalMinutes: number;
  readonly revocationGracePeriodMinutes: number;
  readonly enableAutomaticCleanup: boolean;
  readonly enableSecurityMonitoring: boolean;
}

/**
 * Default token expiration policy
 */
const DEFAULT_POLICY: TokenExpirationPolicy = {
  defaultExpirationHours: 24 * 7, // 7 days
  maxTokenLifetimeHours: 24 * 30, // 30 days maximum
  cleanupIntervalMinutes: 30,     // Every 30 minutes
  revocationGracePeriodMinutes: 5, // 5 minutes grace period
  enableAutomaticCleanup: true,
  enableSecurityMonitoring: true
};

/**
 * Token revocation reason
 */
export enum TokenRevocationReason {
  USER_REQUEST = 'USER_REQUEST',
  SECURITY_BREACH = 'SECURITY_BREACH',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  EXPIRED = 'EXPIRED',
  SYSTEM_MAINTENANCE = 'SYSTEM_MAINTENANCE',
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  USER_DELETION = 'USER_DELETION'
}

/**
 * Token expiration event data
 */
export interface TokenExpirationEvent {
  readonly tokenHash: string;
  readonly userId: UserId;
  readonly reason: TokenRevocationReason;
  readonly timestamp: Date;
  readonly gracePeriodEnd?: Date;
}

/**
 * Token cleanup statistics
 */
export interface TokenCleanupStats {
  readonly timestamp: Date;
  readonly expiredTokens: number;
  readonly revokedTokens: number;
  readonly totalCleaned: number;
  readonly cleanupDurationMs: number;
  readonly errors: number;
}

/**
 * Token security alert
 */
export interface TokenSecurityAlert {
  readonly alertType: 'ENUMERATION_ATTEMPT' | 'BRUTE_FORCE' | 'SUSPICIOUS_PATTERN';
  readonly tokenHash?: string;
  readonly userId?: UserId;
  readonly ipAddress?: string;
  readonly timestamp: Date;
  readonly details: Record<string, any>;
}

/**
 * Token expiration service events
 */
export interface TokenExpirationEvents {
  'token-expired': (event: TokenExpirationEvent) => void;
  'token-revoked': (event: TokenExpirationEvent) => void;
  'cleanup-completed': (stats: TokenCleanupStats) => void;
  'security-alert': (alert: TokenSecurityAlert) => void;
}

/**
 * Token expiration service
 */
export class TokenExpirationService extends EventEmitter {
  private readonly dbPool: Pool;
  private readonly policy: TokenExpirationPolicy;
  private readonly hasher: TokenHasher;
  private cleanupTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private readonly suspiciousActivity: Map<string, number> = new Map();

  constructor(
    dbPool: Pool,
    policy: Partial<TokenExpirationPolicy> = {},
    hasher: TokenHasher = new TokenHasher()
  ) {
    super();
    this.dbPool = dbPool;
    this.policy = { ...DEFAULT_POLICY, ...policy };
    this.hasher = hasher;
  }

  /**
   * Start token expiration monitoring and cleanup
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('Token expiration service is already running');
      return;
    }

    if (!this.policy.enableAutomaticCleanup) {
      logger.info('Automatic token cleanup is disabled');
      return;
    }

    this.isRunning = true;
    const intervalMs = this.policy.cleanupIntervalMinutes * 60 * 1000;

    this.cleanupTimer = setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        logger.error('Token cleanup failed:', error as Record<string, unknown>);
      }
    }, intervalMs);

    logger.info(`Token expiration service started with ${this.policy.cleanupIntervalMinutes}min interval`);
  }

  /**
   * Stop token expiration monitoring
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    this.isRunning = false;
    this.suspiciousActivity.clear();
    logger.info('Token expiration service stopped');
  }

  /**
   * Set token expiration time
   */
  public async setTokenExpiration(
    token: SecureToken,
    expirationHours: number
  ): Promise<boolean> {
    try {
      // Validate expiration time
      if (expirationHours > this.policy.maxTokenLifetimeHours) {
        logger.warn(`Requested expiration ${expirationHours}h exceeds maximum ${this.policy.maxTokenLifetimeHours}h`);
        expirationHours = this.policy.maxTokenLifetimeHours;
      }

      const hashedToken = this.hasher.hashToken(token);
      const expiresAt = new Date(Date.now() + (expirationHours * 60 * 60 * 1000));

      const result = await this.dbPool.query(
        'UPDATE token_mappings SET expires_at = $1 WHERE hashed_token = $2 AND is_revoked = false',
        [expiresAt, this.hasher.formatHashedToken(hashedToken)]
      );

      const updated = (result.rowCount || 0) > 0;
      
      if (updated) {
        logger.debug(`Updated token expiration to ${expirationHours} hours`);
      } else {
        logger.warn('Token not found or already revoked for expiration update');
      }

      return updated;
    } catch (error) {
      logger.error('Failed to set token expiration:', error as Record<string, unknown>);
      return false;
    }
  }

  /**
   * Revoke a specific token
   */
  public async revokeToken(
    token: SecureToken,
    reason: TokenRevocationReason,
    gracePeriodMinutes?: number
  ): Promise<boolean> {
    try {
      const hashedToken = this.hasher.hashToken(token);
      const hashedTokenStr = this.hasher.formatHashedToken(hashedToken);
      
      // Get token metadata first
      const tokenResult = await this.dbPool.query(
        'SELECT user_id FROM token_mappings WHERE hashed_token = $1 AND is_revoked = false',
        [hashedTokenStr]
      );

      if (tokenResult.rows.length === 0) {
        logger.warn('Token not found or already revoked');
        return false;
      }

      const userId = tokenResult.rows[0].user_id;
      const gracePeriod = gracePeriodMinutes || this.policy.revocationGracePeriodMinutes;
      const gracePeriodEnd = new Date(Date.now() + (gracePeriod * 60 * 1000));

      // Revoke the token
      const result = await this.dbPool.query(
        'UPDATE token_mappings SET is_revoked = true, revoked_at = NOW(), revoked_reason = $1 WHERE hashed_token = $2',
        [reason, hashedTokenStr]
      );

      const revoked = (result.rowCount || 0) > 0;

      if (revoked) {
        // Emit revocation event
        const event: TokenExpirationEvent = {
          tokenHash: hashedTokenStr.substring(0, 16) + '...',
          userId,
          reason,
          timestamp: new Date(),
          gracePeriodEnd
        };

        this.emit('token-revoked', event);

        // Log security event
        await this.logSecurityEvent('TOKEN_REVOKED', {
          userId,
          reason,
          gracePeriodMinutes: gracePeriod
        });

        logger.info(`Revoked token for user ${userId}, reason: ${reason}`);
      }

      return revoked;
    } catch (error) {
      logger.error('Failed to revoke token:', error as Record<string, unknown>);
      return false;
    }
  }

  /**
   * Revoke all tokens for a user
   */
  public async revokeAllUserTokens(
    userId: UserId,
    reason: TokenRevocationReason
  ): Promise<number> {
    try {
      const result = await this.dbPool.query(
        'UPDATE token_mappings SET is_revoked = true, revoked_at = NOW(), revoked_reason = $1 WHERE user_id = $2 AND is_revoked = false',
        [reason, userId]
      );

      const revokedCount = result.rowCount || 0;

      if (revokedCount > 0) {
        // Emit revocation event
        const event: TokenExpirationEvent = {
          tokenHash: 'ALL_USER_TOKENS',
          userId,
          reason,
          timestamp: new Date()
        };

        this.emit('token-revoked', event);

        // Log security event
        await this.logSecurityEvent('ALL_USER_TOKENS_REVOKED', {
          userId,
          reason,
          tokenCount: revokedCount
        });

        logger.info(`Revoked ${revokedCount} tokens for user ${userId}, reason: ${reason}`);
      }

      return revokedCount;
    } catch (error) {
      logger.error(`Failed to revoke all tokens for user ${userId}:`, error as Record<string, unknown>);
      return 0;
    }
  }

  /**
   * Check if token is expired
   */
  public async isTokenExpired(token: SecureToken): Promise<boolean> {
    try {
      const hashedToken = this.hasher.hashToken(token);
      const hashedTokenStr = this.hasher.formatHashedToken(hashedToken);

      const result = await this.dbPool.query(
        'SELECT expires_at, is_revoked FROM token_mappings WHERE hashed_token = $1',
        [hashedTokenStr]
      );

      if (result.rows.length === 0) {
        return true; // Token not found, consider expired
      }

      const { expires_at, is_revoked } = result.rows[0];
      
      if (is_revoked) {
        return true; // Revoked tokens are considered expired
      }

      return expires_at && new Date() > new Date(expires_at);
    } catch (error) {
      logger.error('Failed to check token expiration:', error as Record<string, unknown>);
      return true; // Assume expired on error for security
    }
  }

  /**
   * Get token expiration info
   */
  public async getTokenExpirationInfo(token: SecureToken): Promise<{
    isExpired: boolean;
    isRevoked: boolean;
    expiresAt?: Date;
    revokedAt?: Date;
    revocationReason?: string;
  } | null> {
    try {
      const hashedToken = this.hasher.hashToken(token);
      const hashedTokenStr = this.hasher.formatHashedToken(hashedToken);

      const result = await this.dbPool.query(
        'SELECT expires_at, is_revoked, revoked_at, revoked_reason FROM token_mappings WHERE hashed_token = $1',
        [hashedTokenStr]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const now = new Date();
      const expiresAt = row.expires_at ? new Date(row.expires_at) : undefined;

      return {
        isExpired: expiresAt ? now > expiresAt : false,
        isRevoked: row.is_revoked,
        expiresAt,
        revokedAt: row.revoked_at ? new Date(row.revoked_at) : undefined,
        revocationReason: row.revoked_reason
      };
    } catch (error) {
      logger.error('Failed to get token expiration info:', error as Record<string, unknown>);
      return null;
    }
  }

  /**
   * Perform token cleanup
   */
  public async performCleanup(): Promise<TokenCleanupStats> {
    const startTime = Date.now();
    let expiredTokens = 0;
    let revokedTokens = 0;
    let errors = 0;

    try {
      logger.debug('Starting token cleanup');

      // Clean up expired tokens
      const expiredResult = await this.dbPool.query(
        'DELETE FROM token_mappings WHERE expires_at < NOW() AND is_revoked = false'
      );
      expiredTokens = expiredResult.rowCount || 0;

      // Clean up old revoked tokens (older than 30 days)
      const revokedResult = await this.dbPool.query(
        'DELETE FROM token_mappings WHERE is_revoked = true AND revoked_at < NOW() - INTERVAL \'30 days\''
      );
      revokedTokens = revokedResult.rowCount || 0;

      const stats: TokenCleanupStats = {
        timestamp: new Date(),
        expiredTokens,
        revokedTokens,
        totalCleaned: expiredTokens + revokedTokens,
        cleanupDurationMs: Date.now() - startTime,
        errors
      };

      // Emit cleanup completed event
      this.emit('cleanup-completed', stats);

      if (stats.totalCleaned > 0) {
        logger.info(`Token cleanup completed: ${stats.totalCleaned} tokens cleaned (${stats.expiredTokens} expired, ${stats.revokedTokens} revoked)`);
      }

      return stats;
    } catch (error) {
      errors++;
      logger.error('Token cleanup failed:', error as Record<string, unknown>);
      
      return {
        timestamp: new Date(),
        expiredTokens,
        revokedTokens,
        totalCleaned: expiredTokens + revokedTokens,
        cleanupDurationMs: Date.now() - startTime,
        errors
      };
    }
  }

  /**
   * Monitor for suspicious token activity
   */
  public async monitorTokenActivity(
    tokenHash: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    if (!this.policy.enableSecurityMonitoring) {
      return;
    }

    try {
      const key = ipAddress || 'unknown';
      const currentCount = this.suspiciousActivity.get(key) || 0;
      this.suspiciousActivity.set(key, currentCount + 1);

      // Check for enumeration attempts (many failed token validations from same IP)
      if (currentCount > 10) {
        const alert: TokenSecurityAlert = {
          alertType: 'ENUMERATION_ATTEMPT',
          tokenHash: tokenHash.substring(0, 16) + '...',
          ipAddress,
          timestamp: new Date(),
          details: {
            attemptCount: currentCount,
            userAgent
          }
        };

        this.emit('security-alert', alert);

        // Log security event
        await this.logSecurityEvent('TOKEN_ENUMERATION_DETECTED', {
          ipAddress,
          attemptCount: currentCount,
          userAgent
        });

        logger.warn(`Token enumeration detected from IP: ${ipAddress}`);
      }

      // Reset counter after 1 hour
      setTimeout(() => {
        this.suspiciousActivity.delete(key);
      }, 60 * 60 * 1000);

    } catch (error) {
      logger.error('Failed to monitor token activity:', error as Record<string, unknown>);
    }
  }

  /**
   * Get token expiration statistics
   */
  public async getExpirationStatistics(): Promise<{
    totalTokens: number;
    activeTokens: number;
    expiredTokens: number;
    revokedTokens: number;
    expiringIn24Hours: number;
    expiringIn7Days: number;
    averageTokenLifetime: number;
  }> {
    try {
      const [
        totalResult,
        activeResult,
        expiredResult,
        revokedResult,
        expiring24hResult,
        expiring7dResult,
        lifetimeResult
      ] = await Promise.all([
        this.dbPool.query('SELECT COUNT(*) as count FROM token_mappings'),
        this.dbPool.query('SELECT COUNT(*) as count FROM token_mappings WHERE is_revoked = false AND (expires_at IS NULL OR expires_at > NOW())'),
        this.dbPool.query('SELECT COUNT(*) as count FROM token_mappings WHERE expires_at < NOW() AND is_revoked = false'),
        this.dbPool.query('SELECT COUNT(*) as count FROM token_mappings WHERE is_revoked = true'),
        this.dbPool.query('SELECT COUNT(*) as count FROM token_mappings WHERE is_revoked = false AND expires_at BETWEEN NOW() AND NOW() + INTERVAL \'24 hours\''),
        this.dbPool.query('SELECT COUNT(*) as count FROM token_mappings WHERE is_revoked = false AND expires_at BETWEEN NOW() AND NOW() + INTERVAL \'7 days\''),
        this.dbPool.query('SELECT AVG(EXTRACT(EPOCH FROM (COALESCE(revoked_at, expires_at, NOW()) - created_at))) as avg_lifetime FROM token_mappings')
      ]);

      return {
        totalTokens: parseInt(totalResult.rows[0]?.count || '0'),
        activeTokens: parseInt(activeResult.rows[0]?.count || '0'),
        expiredTokens: parseInt(expiredResult.rows[0]?.count || '0'),
        revokedTokens: parseInt(revokedResult.rows[0]?.count || '0'),
        expiringIn24Hours: parseInt(expiring24hResult.rows[0]?.count || '0'),
        expiringIn7Days: parseInt(expiring7dResult.rows[0]?.count || '0'),
        averageTokenLifetime: parseFloat(lifetimeResult.rows[0]?.avg_lifetime || '0')
      };
    } catch (error) {
      logger.error('Failed to get expiration statistics:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Force immediate cleanup (for testing or manual triggers)
   */
  public async forceCleanup(): Promise<TokenCleanupStats> {
    logger.info('Forcing immediate token cleanup');
    return await this.performCleanup();
  }

  /**
   * Get current expiration policy
   */
  public getExpirationPolicy(): TokenExpirationPolicy {
    return { ...this.policy };
  }

  /**
   * Check if service is running
   */
  public isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Log security event
   */
  private async logSecurityEvent(eventType: string, eventData: Record<string, any>): Promise<void> {
    try {
      await this.dbPool.query(
        'INSERT INTO security_audit_log (event_type, event_data) VALUES ($1, $2)',
        [eventType, JSON.stringify(eventData)]
      );
    } catch (error) {
      logger.error('Failed to log security event:', error as Record<string, unknown>);
    }
  }
}

/**
 * Token expiration service factory
 */
export class TokenExpirationServiceFactory {
  static create(
    dbPool: Pool,
    policy?: Partial<TokenExpirationPolicy>,
    hasher?: TokenHasher
  ): TokenExpirationService {
    return new TokenExpirationService(dbPool, policy, hasher);
  }
}