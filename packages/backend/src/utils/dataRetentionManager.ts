/**
 * Data Retention Manager
 * 
 * Orchestrates all data retention and privacy compliance services
 * for the privacy-preserving QR-based calling system.
 * 
 * Requirements: 5.3, 5.4, 4.5
 */

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { logger } from './logger';
import { DataRetentionService, DataRetentionPolicy, CleanupStatistics } from './dataRetentionService';
import { TokenExpirationService, TokenExpirationPolicy, TokenCleanupStats } from '../security/tokenExpirationService';
import { PrivacyDataHandler, PrivacyComplianceConfig } from './privacyDataHandler';
import { LogSanitizer, SanitizationConfig } from './logSanitizer';
import { TokenManager } from '../security/tokenManager';
import { SessionManager } from '../auth/sessionManager';
import { CallSessionManager } from '../webrtc/callSessionManager';

/**
 * Data retention manager configuration
 */
export interface DataRetentionManagerConfig {
  readonly dataRetentionPolicy: Partial<DataRetentionPolicy>;
  readonly tokenExpirationPolicy: Partial<TokenExpirationPolicy>;
  readonly privacyComplianceConfig: Partial<PrivacyComplianceConfig>;
  readonly sanitizationConfig: Partial<SanitizationConfig>;
  readonly enableAutomaticCleanup: boolean;
  readonly enablePrivacyMonitoring: boolean;
  readonly enableComplianceReporting: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DataRetentionManagerConfig = {
  dataRetentionPolicy: {},
  tokenExpirationPolicy: {},
  privacyComplianceConfig: {},
  sanitizationConfig: {},
  enableAutomaticCleanup: true,
  enablePrivacyMonitoring: true,
  enableComplianceReporting: true
};

/**
 * Comprehensive cleanup statistics
 */
export interface ComprehensiveCleanupStats {
  readonly timestamp: Date;
  readonly dataRetentionStats: CleanupStatistics;
  readonly tokenCleanupStats: TokenCleanupStats;
  readonly totalRecordsProcessed: number;
  readonly totalRecordsDeleted: number;
  readonly privacyViolationsDetected: number;
  readonly sanitizationOperations: number;
  readonly cleanupDurationMs: number;
}

/**
 * Privacy compliance report
 */
export interface PrivacyComplianceReport {
  readonly reportDate: Date;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly totalDataProcessed: number;
  readonly privacyViolationsDetected: number;
  readonly callContentBlocked: number;
  readonly personalDataSanitized: number;
  readonly tokensExpired: number;
  readonly sessionsCleanedUp: number;
  readonly complianceScore: number; // 0-100
  readonly recommendations: string[];
}

/**
 * Data retention manager events
 */
export interface DataRetentionManagerEvents {
  'cleanup-completed': (stats: ComprehensiveCleanupStats) => void;
  'privacy-violation': (violation: any) => void;
  'compliance-report': (report: PrivacyComplianceReport) => void;
  'service-error': (error: { service: string; error: Error }) => void;
}

/**
 * Data retention manager
 */
export class DataRetentionManager extends EventEmitter {
  private readonly config: DataRetentionManagerConfig;
  private readonly dbPool: Pool;
  private readonly dataRetentionService: DataRetentionService;
  private readonly tokenExpirationService: TokenExpirationService;
  private readonly privacyDataHandler: PrivacyDataHandler;
  private readonly logSanitizer: LogSanitizer;
  private isRunning: boolean = false;
  private cleanupTimer?: NodeJS.Timeout;
  private reportTimer?: NodeJS.Timeout;

  constructor(
    dbPool: Pool,
    config: Partial<DataRetentionManagerConfig> = {},
    tokenManager?: TokenManager,
    sessionManager?: SessionManager,
    callSessionManager?: CallSessionManager
  ) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dbPool = dbPool;

    // Initialize services
    this.logSanitizer = new LogSanitizer(this.config.sanitizationConfig);
    this.privacyDataHandler = new PrivacyDataHandler(this.config.privacyComplianceConfig as any, this.logSanitizer);
    
    this.dataRetentionService = new DataRetentionService(
      dbPool,
      this.config.dataRetentionPolicy,
      this.config.privacyComplianceConfig as any,
      tokenManager,
      sessionManager,
      callSessionManager
    );

    this.tokenExpirationService = new TokenExpirationService(
      dbPool,
      this.config.tokenExpirationPolicy
    );

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Start all data retention and privacy compliance services
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Data retention manager is already running');
      return;
    }

    try {
      this.isRunning = true;

      // Start individual services
      if (this.config.enableAutomaticCleanup) {
        this.dataRetentionService.start();
        this.tokenExpirationService.start();
      }

      // Start periodic compliance reporting
      if (this.config.enableComplianceReporting) {
        this.startComplianceReporting();
      }

      logger.info('Data retention manager started successfully');
    } catch (error) {
      this.isRunning = false;
      logger.error('Failed to start data retention manager:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Stop all services
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.isRunning = false;

      // Stop timers
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = undefined;
      }

      if (this.reportTimer) {
        clearInterval(this.reportTimer);
        this.reportTimer = undefined;
      }

      // Stop services
      this.dataRetentionService.stop();
      this.tokenExpirationService.stop();

      logger.info('Data retention manager stopped successfully');
    } catch (error) {
      logger.error('Error stopping data retention manager:', error as Record<string, unknown>);
    }
  }

  /**
   * Perform comprehensive cleanup
   */
  public async performComprehensiveCleanup(): Promise<ComprehensiveCleanupStats> {
    const startTime = Date.now();
    logger.info('Starting comprehensive data retention cleanup');

    try {
      // Perform data retention cleanup
      const dataRetentionStats = await this.dataRetentionService.performCleanup();

      // Perform token cleanup
      const tokenCleanupStats = await this.tokenExpirationService.performCleanup();

      // Get privacy statistics
      const privacyStats = this.privacyDataHandler.getComplianceStatistics();
      const sanitizationStats = this.logSanitizer.getStatistics();

      const comprehensiveStats: ComprehensiveCleanupStats = {
        timestamp: new Date(),
        dataRetentionStats,
        tokenCleanupStats,
        totalRecordsProcessed: dataRetentionStats.totalRecordsDeleted + tokenCleanupStats.totalCleaned,
        totalRecordsDeleted: dataRetentionStats.totalRecordsDeleted + tokenCleanupStats.totalCleaned,
        privacyViolationsDetected: privacyStats.violationsDetected,
        sanitizationOperations: sanitizationStats.sanitizedEntries,
        cleanupDurationMs: Date.now() - startTime
      };

      // Emit cleanup completed event
      this.emit('cleanup-completed', comprehensiveStats);

      logger.info('Comprehensive cleanup completed', {
        duration: comprehensiveStats.cleanupDurationMs,
        totalDeleted: comprehensiveStats.totalRecordsDeleted,
        privacyViolations: comprehensiveStats.privacyViolationsDetected
      });

      return comprehensiveStats;
    } catch (error) {
      logger.error('Comprehensive cleanup failed:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Generate privacy compliance report
   */
  public async generateComplianceReport(
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<PrivacyComplianceReport> {
    const reportDate = new Date();
    const start = periodStart || new Date(reportDate.getTime() - (24 * 60 * 60 * 1000)); // Last 24 hours
    const end = periodEnd || reportDate;

    try {
      // Get statistics from all services
      const retentionStats = await this.dataRetentionService.getRetentionStatistics();
      const tokenStats = await this.tokenExpirationService.getExpirationStatistics();
      const privacyStats = this.privacyDataHandler.getComplianceStatistics();
      const sanitizationStats = this.logSanitizer.getStatistics();

      // Calculate compliance score
      const complianceScore = this.calculateComplianceScore({
        retentionStats,
        tokenStats,
        privacyStats,
        sanitizationStats
      });

      // Generate recommendations
      const recommendations = this.generateRecommendations({
        retentionStats,
        tokenStats,
        privacyStats,
        sanitizationStats,
        complianceScore
      });

      const report: PrivacyComplianceReport = {
        reportDate,
        periodStart: start,
        periodEnd: end,
        totalDataProcessed: privacyStats.totalProcessed,
        privacyViolationsDetected: privacyStats.violationsDetected,
        callContentBlocked: privacyStats.contentBlocked,
        personalDataSanitized: sanitizationStats.sanitizedEntries,
        tokensExpired: tokenStats.expiredTokens,
        sessionsCleanedUp: retentionStats.activeSessions,
        complianceScore,
        recommendations
      };

      // Emit compliance report event
      this.emit('compliance-report', report);

      logger.info('Privacy compliance report generated', {
        complianceScore,
        violationsDetected: report.privacyViolationsDetected,
        recommendationCount: recommendations.length
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate compliance report:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Process data with privacy compliance
   */
  public processDataWithCompliance(data: any): any {
    return this.privacyDataHandler.processSessionData(data);
  }

  /**
   * Validate privacy compliance
   */
  public validatePrivacyCompliance(data: any): boolean {
    const result = this.privacyDataHandler.validatePrivacyCompliance(data);
    return result.isCompliant;
  }

  /**
   * Purge all user data (for GDPR compliance)
   */
  public async purgeUserData(userId: string): Promise<boolean> {
    try {
      logger.info(`Starting user data purge for user: ${userId}`);

      // Purge from data retention service
      const purgeResult = await this.dataRetentionService.purgeUserData(userId as any);

      // Revoke all user tokens
      await this.tokenExpirationService.revokeAllUserTokens(
        userId as any,
        'USER_DELETION' as any
      );

      logger.info(`User data purge completed for user: ${userId}`, {
        success: purgeResult
      });

      return purgeResult;
    } catch (error) {
      logger.error(`Failed to purge user data for user: ${userId}`, error as Record<string, unknown>);
      return false;
    }
  }

  /**
   * Get comprehensive statistics
   */
  public async getComprehensiveStatistics(): Promise<{
    dataRetention: any;
    tokenExpiration: any;
    privacyCompliance: any;
    sanitization: any;
    isRunning: boolean;
  }> {
    try {
      const [retentionStats, tokenStats] = await Promise.all([
        this.dataRetentionService.getRetentionStatistics(),
        this.tokenExpirationService.getExpirationStatistics()
      ]);

      return {
        dataRetention: retentionStats,
        tokenExpiration: tokenStats,
        privacyCompliance: this.privacyDataHandler.getComplianceStatistics(),
        sanitization: this.logSanitizer.getStatistics(),
        isRunning: this.isRunning
      };
    } catch (error) {
      logger.error('Failed to get comprehensive statistics:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Check if manager is running
   */
  public isManagerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Set up event listeners for all services
   */
  private setupEventListeners(): void {
    // Token expiration service events
    this.tokenExpirationService.on('privacy-violation', (violation) => {
      this.emit('privacy-violation', violation);
    });

    this.tokenExpirationService.on('security-alert', (alert) => {
      logger.logSecurityEvent(alert.alertType, alert.details, 'HIGH');
    });

    // Privacy data handler events
    this.privacyDataHandler.on('privacy-violation', (violation) => {
      this.emit('privacy-violation', violation);
      logger.logSecurityEvent('PRIVACY_VIOLATION', violation.details, violation.severity);
    });

    this.privacyDataHandler.on('data-blocked', (data) => {
      logger.info('Data blocked for privacy compliance', data);
    });
  }

  /**
   * Start periodic compliance reporting
   */
  private startComplianceReporting(): void {
    // Generate daily compliance reports
    const reportInterval = 24 * 60 * 60 * 1000; // 24 hours

    this.reportTimer = setInterval(async () => {
      try {
        await this.generateComplianceReport();
      } catch (error) {
        logger.error('Periodic compliance reporting failed:', error as Record<string, unknown>);
      }
    }, reportInterval);
  }

  /**
   * Calculate compliance score (0-100)
   */
  private calculateComplianceScore(stats: any): number {
    let score = 100;

    // Deduct points for violations
    if (stats.privacyStats.violationsDetected > 0) {
      score -= Math.min(50, stats.privacyStats.violationsDetected * 5);
    }

    // Deduct points for expired tokens not cleaned up
    if (stats.tokenStats.expiredTokens > 0) {
      score -= Math.min(20, stats.tokenStats.expiredTokens * 2);
    }

    // Deduct points for unsanitized data
    const sanitizationRatio = stats.sanitizationStats.totalEntries > 0
      ? stats.sanitizationStats.sanitizedEntries / stats.sanitizationStats.totalEntries
      : 1;
    
    if (sanitizationRatio < 0.9) {
      score -= (1 - sanitizationRatio) * 30;
    }

    return Math.max(0, Math.round(score));
  }

  /**
   * Generate compliance recommendations
   */
  private generateRecommendations(stats: any): string[] {
    const recommendations: string[] = [];

    if (stats.privacyStats.violationsDetected > 0) {
      recommendations.push('Review and address privacy violations detected in the system');
    }

    if (stats.tokenStats.expiredTokens > 10) {
      recommendations.push('Increase token cleanup frequency to reduce expired token accumulation');
    }

    if (stats.sanitizationStats.totalReplacements > 100) {
      recommendations.push('Review data input validation to reduce personal data in logs');
    }

    if (stats.complianceScore < 80) {
      recommendations.push('Implement additional privacy controls to improve compliance score');
    }

    if (stats.retentionStats.activeCallSessions > 1000) {
      recommendations.push('Consider reducing call session retention period');
    }

    return recommendations;
  }
}

/**
 * Data retention manager factory
 */
export class DataRetentionManagerFactory {
  static create(
    dbPool: Pool,
    config?: Partial<DataRetentionManagerConfig>,
    tokenManager?: TokenManager,
    sessionManager?: SessionManager,
    callSessionManager?: CallSessionManager
  ): DataRetentionManager {
    return new DataRetentionManager(dbPool, config, tokenManager, sessionManager, callSessionManager);
  }
}