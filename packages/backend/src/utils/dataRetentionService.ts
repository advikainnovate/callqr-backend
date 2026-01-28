/**
 * Data Retention Service
 * 
 * Implements automatic cleanup of expired sessions and privacy-compliant
 * data handling for the privacy-preserving QR-based calling system.
 * 
 * Requirements: 5.3, 5.4, 4.5
 */

import { Pool } from 'pg';
import { logger } from './logger';
import { TokenManager } from '../security/tokenManager';
import { SessionManager } from '../auth/sessionManager';
import { CallSessionManager } from '../webrtc/callSessionManager';

/**
 * Data retention policy configuration
 */
export interface DataRetentionPolicy {
  readonly tokenExpirationHours: number;
  readonly sessionExpirationHours: number;
  readonly callSessionRetentionDays: number;
  readonly auditLogRetentionDays: number;
  readonly rateLimitRetentionDays: number;
  readonly cleanupIntervalHours: number;
  readonly enableAutomaticCleanup: boolean;
}

/**
 * Default data retention policy
 */
const DEFAULT_POLICY: DataRetentionPolicy = {
  tokenExpirationHours: 24 * 7, // 7 days
  sessionExpirationHours: 24,   // 1 day
  callSessionRetentionDays: 30, // 30 days
  auditLogRetentionDays: 90,    // 90 days
  rateLimitRetentionDays: 1,    // 1 day
  cleanupIntervalHours: 6,      // Every 6 hours
  enableAutomaticCleanup: true
};

/**
 * Cleanup statistics
 */
export interface CleanupStatistics {
  readonly timestamp: Date;
  tokensDeleted: number;
  sessionsDeleted: number;
  callSessionsDeleted: number;
  auditLogsDeleted: number;
  rateLimitsDeleted: number;
  totalRecordsDeleted: number;
  cleanupDurationMs: number;
}

/**
 * Privacy compliance configuration
 */
export interface PrivacyComplianceConfig {
  readonly enableCallContentPurging: boolean;
  readonly enableLogSanitization: boolean;
  readonly enablePersonalDataDetection: boolean;
  readonly maxLogRetentionDays: number;
}

/**
 * Default privacy compliance configuration
 */
const DEFAULT_PRIVACY_CONFIG: PrivacyComplianceConfig = {
  enableCallContentPurging: true,
  enableLogSanitization: true,
  enablePersonalDataDetection: true,
  maxLogRetentionDays: 90
};

/**
 * Data retention service
 */
export class DataRetentionService {
  private readonly dbPool: Pool;
  private readonly policy: DataRetentionPolicy;
  private readonly privacyConfig: PrivacyComplianceConfig;
  private readonly tokenManager?: TokenManager;
  private readonly sessionManager?: SessionManager;
  private readonly callSessionManager?: CallSessionManager;
  private cleanupTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(
    dbPool: Pool,
    policy: Partial<DataRetentionPolicy> = {},
    privacyConfig: Partial<PrivacyComplianceConfig> = {},
    tokenManager?: TokenManager,
    sessionManager?: SessionManager,
    callSessionManager?: CallSessionManager
  ) {
    this.dbPool = dbPool;
    this.policy = { ...DEFAULT_POLICY, ...policy };
    this.privacyConfig = { ...DEFAULT_PRIVACY_CONFIG, ...privacyConfig };
    this.tokenManager = tokenManager;
    this.sessionManager = sessionManager;
    this.callSessionManager = callSessionManager;
  }

  /**
   * Start automatic data retention cleanup
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('Data retention service is already running');
      return;
    }

    if (!this.policy.enableAutomaticCleanup) {
      logger.info('Automatic cleanup is disabled');
      return;
    }

    this.isRunning = true;
    const intervalMs = this.policy.cleanupIntervalHours * 60 * 60 * 1000;

    this.cleanupTimer = setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        logger.error('Automatic cleanup failed:', error as Record<string, unknown>);
      }
    }, intervalMs);

    logger.info(`Data retention service started with ${this.policy.cleanupIntervalHours}h interval`);
  }

  /**
   * Stop automatic data retention cleanup
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
    logger.info('Data retention service stopped');
  }

  /**
   * Perform comprehensive data cleanup
   */
  public async performCleanup(): Promise<CleanupStatistics> {
    const startTime = Date.now();
    logger.info('Starting data retention cleanup');

    try {
      const stats: CleanupStatistics = {
        timestamp: new Date(),
        tokensDeleted: 0,
        sessionsDeleted: 0,
        callSessionsDeleted: 0,
        auditLogsDeleted: 0,
        rateLimitsDeleted: 0,
        totalRecordsDeleted: 0,
        cleanupDurationMs: 0
      };

      // Clean up expired tokens
      stats.tokensDeleted = await this.cleanupExpiredTokens();

      // Clean up expired user sessions
      stats.sessionsDeleted = await this.cleanupExpiredSessions();

      // Clean up old call sessions
      stats.callSessionsDeleted = await this.cleanupOldCallSessions();

      // Clean up old audit logs
      stats.auditLogsDeleted = await this.cleanupOldAuditLogs();

      // Clean up old rate limit entries
      stats.rateLimitsDeleted = await this.cleanupOldRateLimits();

      // Calculate totals
      stats.totalRecordsDeleted = stats.tokensDeleted + stats.sessionsDeleted + 
                                 stats.callSessionsDeleted + stats.auditLogsDeleted + 
                                 stats.rateLimitsDeleted;
      stats.cleanupDurationMs = Date.now() - startTime;

      // Log cleanup results
      logger.info('Data retention cleanup completed', {
        duration: stats.cleanupDurationMs,
        totalDeleted: stats.totalRecordsDeleted,
        breakdown: {
          tokens: stats.tokensDeleted,
          sessions: stats.sessionsDeleted,
          callSessions: stats.callSessionsDeleted,
          auditLogs: stats.auditLogsDeleted,
          rateLimits: stats.rateLimitsDeleted
        }
      });

      return stats;
    } catch (error) {
      logger.error('Data retention cleanup failed:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Clean up expired tokens
   */
  public async cleanupExpiredTokens(): Promise<number> {
    try {
      // Use database function for cleanup
      const result = await this.dbPool.query('SELECT cleanup_expired_tokens()');
      const deletedCount = result.rows[0]?.cleanup_expired_tokens || 0;

      // Also cleanup in-memory token manager if available
      if (this.tokenManager) {
        const memoryCleanedCount = await this.tokenManager.cleanupExpiredTokens();
        logger.debug(`Cleaned ${memoryCleanedCount} tokens from memory`);
      }

      logger.debug(`Cleaned up ${deletedCount} expired tokens from database`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired tokens:', error as Record<string, unknown>);
      return 0;
    }
  }

  /**
   * Clean up expired user sessions
   */
  public async cleanupExpiredSessions(): Promise<number> {
    try {
      // Use database function for cleanup
      const result = await this.dbPool.query('SELECT cleanup_expired_sessions()');
      const deletedCount = result.rows[0]?.cleanup_expired_sessions || 0;

      logger.debug(`Cleaned up ${deletedCount} expired user sessions from database`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions:', error as Record<string, unknown>);
      return 0;
    }
  }

  /**
   * Clean up old call sessions
   */
  public async cleanupOldCallSessions(): Promise<number> {
    try {
      // Use database function for cleanup
      const result = await this.dbPool.query('SELECT cleanup_old_call_sessions()');
      const deletedCount = result.rows[0]?.cleanup_old_call_sessions || 0;

      // Also cleanup in-memory call session manager if available
      if (this.callSessionManager) {
        // The call session manager has its own cleanup mechanism
        const stats = this.callSessionManager.getSessionStatistics();
        logger.debug(`Call session manager has ${stats.activeSessions} active sessions`);
      }

      logger.debug(`Cleaned up ${deletedCount} old call sessions from database`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old call sessions:', error as Record<string, unknown>);
      return 0;
    }
  }

  /**
   * Clean up old audit logs
   */
  public async cleanupOldAuditLogs(): Promise<number> {
    try {
      // Use database function for cleanup
      const result = await this.dbPool.query('SELECT cleanup_old_audit_logs()');
      const deletedCount = result.rows[0]?.cleanup_old_audit_logs || 0;

      logger.debug(`Cleaned up ${deletedCount} old audit logs from database`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old audit logs:', error as Record<string, unknown>);
      return 0;
    }
  }

  /**
   * Clean up old rate limit entries
   */
  public async cleanupOldRateLimits(): Promise<number> {
    try {
      // Use database function for cleanup
      const result = await this.dbPool.query('SELECT cleanup_old_rate_limits()');
      const deletedCount = result.rows[0]?.cleanup_old_rate_limits || 0;

      logger.debug(`Cleaned up ${deletedCount} old rate limit entries from database`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old rate limits:', error as Record<string, unknown>);
      return 0;
    }
  }

  /**
   * Revoke all tokens for a user (for privacy compliance)
   */
  public async revokeAllUserTokens(userId: string): Promise<number> {
    try {
      const result = await this.dbPool.query(
        'UPDATE token_mappings SET is_revoked = true, revoked_at = NOW(), revoked_reason = $1 WHERE user_id = $2 AND is_revoked = false',
        ['USER_REQUEST', userId]
      );

      const revokedCount = result.rowCount || 0;

      // Also revoke in token manager if available
      if (this.tokenManager) {
        await this.tokenManager.revokeAllUserTokens(userId as any);
      }

      logger.info(`Revoked ${revokedCount} tokens for user ${userId}`);
      return revokedCount;
    } catch (error) {
      logger.error(`Failed to revoke tokens for user ${userId}:`, error as Record<string, unknown>);
      return 0;
    }
  }

  /**
   * Purge all user data (for privacy compliance)
   */
  public async purgeUserData(userId: string): Promise<boolean> {
    const client = await this.dbPool.connect();
    
    try {
      await client.query('BEGIN');

      // Revoke all tokens
      await client.query(
        'UPDATE token_mappings SET is_revoked = true, revoked_at = NOW(), revoked_reason = $1 WHERE user_id = $2',
        ['USER_DELETION', userId]
      );

      // Delete user sessions
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);

      // Delete MFA secrets
      await client.query('DELETE FROM mfa_secrets WHERE user_id = $1', [userId]);

      // Anonymize audit logs (replace user ID with anonymous identifier)
      const anonymousId = `deleted_user_${Date.now()}`;
      await client.query(
        'UPDATE security_audit_log SET anonymous_user_id = $1 WHERE anonymous_user_id = $2',
        [anonymousId, userId]
      );

      // Delete user account (this will cascade to token_mappings due to foreign key)
      await client.query('DELETE FROM users WHERE user_id = $1', [userId]);

      await client.query('COMMIT');

      // Also cleanup in-memory managers if available
      if (this.sessionManager) {
        await this.sessionManager.destroyAllUserSessions(userId as any);
      }

      if (this.tokenManager) {
        await this.tokenManager.revokeAllUserTokens(userId as any);
      }

      logger.info(`Purged all data for user ${userId}`);
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Failed to purge data for user ${userId}:`, error as Record<string, unknown>);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Sanitize log data to remove personal information
   */
  public sanitizeLogData(logData: any): any {
    if (!this.privacyConfig.enableLogSanitization) {
      return logData;
    }

    // Create a deep copy to avoid modifying original
    const sanitized = JSON.parse(JSON.stringify(logData));

    // Remove or mask personal data fields
    const personalDataFields = [
      'email', 'phone', 'phoneNumber', 'name', 'firstName', 'lastName',
      'address', 'ipAddress', 'userAgent', 'deviceId', 'sessionToken'
    ];

    const maskValue = (value: any): any => {
      if (typeof value === 'string') {
        if (value.length <= 4) return '***';
        return value.substring(0, 2) + '***' + value.substring(value.length - 2);
      }
      return '***';
    };

    const sanitizeObject = (obj: any): void => {
      if (typeof obj !== 'object' || obj === null) return;

      for (const key in obj) {
        if (personalDataFields.includes(key.toLowerCase())) {
          obj[key] = maskValue(obj[key]);
        } else if (typeof obj[key] === 'object') {
          sanitizeObject(obj[key]);
        }
      }
    };

    sanitizeObject(sanitized);
    return sanitized;
  }

  /**
   * Detect potential personal data in content
   */
  public detectPersonalData(content: string): boolean {
    if (!this.privacyConfig.enablePersonalDataDetection) {
      return false;
    }

    // Patterns for detecting personal data
    const patterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}-\d{3}-\d{4}\b/, // Phone number (US format)
      /\b\d{10}\b/, // 10-digit number (potential phone)
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN format
      /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/, // Credit card format
    ];

    return patterns.some(pattern => pattern.test(content));
  }

  /**
   * Get data retention statistics
   */
  public async getRetentionStatistics(): Promise<{
    activeTokens: number;
    activeSessions: number;
    activeCallSessions: number;
    auditLogCount: number;
    rateLimitEntries: number;
    oldestToken: Date | null;
    oldestSession: Date | null;
    oldestCallSession: Date | null;
  }> {
    try {
      const [
        tokenStats,
        sessionStats,
        callSessionStats,
        auditStats,
        rateLimitStats
      ] = await Promise.all([
        this.dbPool.query('SELECT COUNT(*) as count, MIN(created_at) as oldest FROM token_mappings WHERE is_revoked = false AND expires_at > NOW()'),
        this.dbPool.query('SELECT COUNT(*) as count, MIN(created_at) as oldest FROM user_sessions WHERE is_active = true AND expires_at > NOW()'),
        this.dbPool.query('SELECT COUNT(*) as count, MIN(created_at) as oldest FROM call_sessions WHERE status NOT IN (\'ENDED\', \'FAILED\')'),
        this.dbPool.query('SELECT COUNT(*) as count FROM security_audit_log'),
        this.dbPool.query('SELECT COUNT(*) as count FROM rate_limits WHERE window_end > NOW()')
      ]);

      return {
        activeTokens: parseInt(tokenStats.rows[0]?.count || '0'),
        activeSessions: parseInt(sessionStats.rows[0]?.count || '0'),
        activeCallSessions: parseInt(callSessionStats.rows[0]?.count || '0'),
        auditLogCount: parseInt(auditStats.rows[0]?.count || '0'),
        rateLimitEntries: parseInt(rateLimitStats.rows[0]?.count || '0'),
        oldestToken: tokenStats.rows[0]?.oldest || null,
        oldestSession: sessionStats.rows[0]?.oldest || null,
        oldestCallSession: callSessionStats.rows[0]?.oldest || null
      };
    } catch (error) {
      logger.error('Failed to get retention statistics:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Force immediate cleanup (for testing or manual triggers)
   */
  public async forceCleanup(): Promise<CleanupStatistics> {
    logger.info('Forcing immediate data retention cleanup');
    return await this.performCleanup();
  }

  /**
   * Get current retention policy
   */
  public getRetentionPolicy(): DataRetentionPolicy {
    return { ...this.policy };
  }

  /**
   * Get current privacy compliance configuration
   */
  public getPrivacyConfig(): PrivacyComplianceConfig {
    return { ...this.privacyConfig };
  }

  /**
   * Check if service is running
   */
  public isServiceRunning(): boolean {
    return this.isRunning;
  }
}

/**
 * Data retention service factory
 */
export class DataRetentionServiceFactory {
  static create(
    dbPool: Pool,
    policy?: Partial<DataRetentionPolicy>,
    privacyConfig?: Partial<PrivacyComplianceConfig>,
    tokenManager?: TokenManager,
    sessionManager?: SessionManager,
    callSessionManager?: CallSessionManager
  ): DataRetentionService {
    return new DataRetentionService(
      dbPool,
      policy,
      privacyConfig,
      tokenManager,
      sessionManager,
      callSessionManager
    );
  }
}