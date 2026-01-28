/**
 * Call quality management system
 * 
 * Monitors call quality metrics and provides feedback without compromising privacy.
 * Implements adaptive quality control and timeout mechanisms for call sessions.
 */

import { logger } from './logger';
import { AnonymousSessionId } from './types';
import { timeoutManager, TimeoutType, createCallDurationTimeout, createRingingTimeout } from './timeoutManager';
import { gracefulDegradationManager, QualityLevel } from './gracefulDegradation';

// Call quality metrics
export interface CallQualityMetrics {
  sessionId: AnonymousSessionId;
  timestamp: Date;
  audioQuality: {
    bitrate: number;           // kbps
    packetLoss: number;        // percentage
    jitter: number;            // ms
    roundTripTime: number;     // ms
    audioLevel: number;        // dB
  };
  networkQuality: {
    bandwidth: number;         // kbps
    latency: number;          // ms
    stability: number;        // 0-1 score
  };
  overallScore: number;       // 0-5 quality score
}

// Quality thresholds
export interface QualityThresholds {
  excellent: { minScore: number; maxPacketLoss: number; maxLatency: number };
  good: { minScore: number; maxPacketLoss: number; maxLatency: number };
  fair: { minScore: number; maxPacketLoss: number; maxLatency: number };
  poor: { minScore: number; maxPacketLoss: number; maxLatency: number };
}

// Default quality thresholds
const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  excellent: { minScore: 4.5, maxPacketLoss: 1, maxLatency: 100 },
  good: { minScore: 3.5, maxPacketLoss: 3, maxLatency: 200 },
  fair: { minScore: 2.5, maxPacketLoss: 5, maxLatency: 400 },
  poor: { minScore: 1.0, maxPacketLoss: 10, maxLatency: 800 }
};

// Call quality assessment
export enum QualityRating {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
  UNACCEPTABLE = 'UNACCEPTABLE'
}

// Quality feedback (privacy-compliant)
export interface QualityFeedback {
  sessionId: AnonymousSessionId;
  rating: QualityRating;
  timestamp: Date;
  suggestions: string[];
  networkRecommendations: {
    suggestedBitrate?: number;
    suggestedCodec?: string;
    enableAdaptation: boolean;
  };
}

// Call timeout configuration
export interface CallTimeoutConfig {
  setupTimeout: number;      // Call setup timeout (ms)
  ringingTimeout: number;    // Ringing timeout (ms)
  maxDuration: number;       // Maximum call duration (ms)
  qualityCheckInterval: number; // Quality check interval (ms)
  warningThreshold: number;  // Warning threshold (percentage of max duration)
}

// Default timeout configuration
const DEFAULT_TIMEOUT_CONFIG: CallTimeoutConfig = {
  setupTimeout: 30000,       // 30 seconds
  ringingTimeout: 45000,     // 45 seconds
  maxDuration: 3600000,      // 1 hour
  qualityCheckInterval: 5000, // 5 seconds
  warningThreshold: 0.9      // 90% of max duration
};

// Call quality manager
export class CallQualityManager {
  private qualityMetrics: Map<AnonymousSessionId, CallQualityMetrics[]> = new Map();
  private activeTimeouts: Map<AnonymousSessionId, string[]> = new Map();
  private qualityCheckIntervals: Map<AnonymousSessionId, NodeJS.Timeout> = new Map();
  private thresholds: QualityThresholds;
  private timeoutConfig: CallTimeoutConfig;

  constructor(
    thresholds: Partial<QualityThresholds> = {},
    timeoutConfig: Partial<CallTimeoutConfig> = {}
  ) {
    this.thresholds = { ...DEFAULT_QUALITY_THRESHOLDS, ...thresholds };
    this.timeoutConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...timeoutConfig };
  }

  // Start call quality monitoring
  startCallMonitoring(
    sessionId: AnonymousSessionId,
    onTimeout: (reason: string) => Promise<void>,
    onQualityChange?: (feedback: QualityFeedback) => Promise<void>
  ): void {
    // Initialize metrics storage
    this.qualityMetrics.set(sessionId, []);
    this.activeTimeouts.set(sessionId, []);

    // Create call duration timeout
    const durationTimeoutId = createCallDurationTimeout(
      sessionId,
      () => onTimeout('Maximum call duration reached'),
      this.timeoutConfig.maxDuration
    );

    this.activeTimeouts.get(sessionId)!.push(durationTimeoutId);

    // Start quality monitoring interval
    const qualityInterval = setInterval(async () => {
      await this.checkCallQuality(sessionId, onQualityChange);
    }, this.timeoutConfig.qualityCheckInterval);

    this.qualityCheckIntervals.set(sessionId, qualityInterval);

    logger.info('Call quality monitoring started', {
      sessionId,
      maxDuration: this.timeoutConfig.maxDuration,
      qualityCheckInterval: this.timeoutConfig.qualityCheckInterval
    });
  }

  // Start ringing timeout
  startRingingTimeout(
    sessionId: AnonymousSessionId,
    onTimeout: () => Promise<void>
  ): string {
    const timeoutId = createRingingTimeout(sessionId, onTimeout);
    
    if (!this.activeTimeouts.has(sessionId)) {
      this.activeTimeouts.set(sessionId, []);
    }
    this.activeTimeouts.get(sessionId)!.push(timeoutId);

    logger.info('Ringing timeout started', {
      sessionId,
      timeout: this.timeoutConfig.ringingTimeout
    });

    return timeoutId;
  }

  // Stop call monitoring
  stopCallMonitoring(sessionId: AnonymousSessionId): void {
    // Cancel all timeouts for this session
    const timeoutIds = this.activeTimeouts.get(sessionId) || [];
    for (const timeoutId of timeoutIds) {
      timeoutManager.cancelTimeout(timeoutId);
    }
    this.activeTimeouts.delete(sessionId);

    // Clear quality check interval
    const interval = this.qualityCheckIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.qualityCheckIntervals.delete(sessionId);
    }

    // Clean up metrics (keep last few for analysis)
    const metrics = this.qualityMetrics.get(sessionId) || [];
    if (metrics.length > 10) {
      // Keep only last 10 metrics for post-call analysis
      this.qualityMetrics.set(sessionId, metrics.slice(-10));
    }

    logger.info('Call quality monitoring stopped', { sessionId });
  }

  // Record quality metrics
  recordQualityMetrics(metrics: CallQualityMetrics): void {
    const sessionMetrics = this.qualityMetrics.get(metrics.sessionId) || [];
    sessionMetrics.push(metrics);

    // Keep only recent metrics (last 100 measurements)
    if (sessionMetrics.length > 100) {
      sessionMetrics.splice(0, sessionMetrics.length - 100);
    }

    this.qualityMetrics.set(metrics.sessionId, sessionMetrics);

    logger.debug('Quality metrics recorded', {
      sessionId: metrics.sessionId,
      overallScore: metrics.overallScore,
      packetLoss: metrics.audioQuality.packetLoss,
      latency: metrics.networkQuality.latency
    });
  }

  // Check call quality and provide feedback
  private async checkCallQuality(
    sessionId: AnonymousSessionId,
    onQualityChange?: (feedback: QualityFeedback) => Promise<void>
  ): Promise<void> {
    const metrics = this.qualityMetrics.get(sessionId) || [];
    if (metrics.length === 0) {
      return;
    }

    const latestMetrics = metrics[metrics.length - 1];
    const rating = this.assessQualityRating(latestMetrics);
    const feedback = this.generateQualityFeedback(latestMetrics, rating);

    // Check if quality has significantly changed
    if (metrics.length > 1) {
      const previousMetrics = metrics[metrics.length - 2];
      const previousRating = this.assessQualityRating(previousMetrics);
      
      if (rating !== previousRating) {
        logger.info('Call quality changed', {
          sessionId,
          previousRating,
          currentRating: rating,
          overallScore: latestMetrics.overallScore
        });

        if (onQualityChange) {
          try {
            await onQualityChange(feedback);
          } catch (error) {
            logger.warn('Quality change callback failed', {
              sessionId,
              error: (error as Error).message
            });
          }
        }
      }
    }

    // Update graceful degradation manager with network conditions
    gracefulDegradationManager.updateNetworkCondition({
      quality: this.mapRatingToQualityLevel(rating),
      latency: latestMetrics.networkQuality.latency,
      bandwidth: latestMetrics.networkQuality.bandwidth,
      packetLoss: latestMetrics.audioQuality.packetLoss,
      jitter: latestMetrics.audioQuality.jitter,
      timestamp: latestMetrics.timestamp
    });
  }

  // Assess quality rating from metrics
  private assessQualityRating(metrics: CallQualityMetrics): QualityRating {
    const { overallScore } = metrics;
    const { packetLoss } = metrics.audioQuality;
    const { latency } = metrics.networkQuality;

    if (
      overallScore >= this.thresholds.excellent.minScore &&
      packetLoss <= this.thresholds.excellent.maxPacketLoss &&
      latency <= this.thresholds.excellent.maxLatency
    ) {
      return QualityRating.EXCELLENT;
    }

    if (
      overallScore >= this.thresholds.good.minScore &&
      packetLoss <= this.thresholds.good.maxPacketLoss &&
      latency <= this.thresholds.good.maxLatency
    ) {
      return QualityRating.GOOD;
    }

    if (
      overallScore >= this.thresholds.fair.minScore &&
      packetLoss <= this.thresholds.fair.maxPacketLoss &&
      latency <= this.thresholds.fair.maxLatency
    ) {
      return QualityRating.FAIR;
    }

    if (
      overallScore >= this.thresholds.poor.minScore &&
      packetLoss <= this.thresholds.poor.maxPacketLoss &&
      latency <= this.thresholds.poor.maxLatency
    ) {
      return QualityRating.POOR;
    }

    return QualityRating.UNACCEPTABLE;
  }

  // Generate quality feedback
  private generateQualityFeedback(
    metrics: CallQualityMetrics,
    rating: QualityRating
  ): QualityFeedback {
    const suggestions: string[] = [];
    const networkRecommendations = {
      enableAdaptation: false,
      suggestedBitrate: undefined as number | undefined,
      suggestedCodec: undefined as string | undefined
    };

    // Generate suggestions based on quality issues
    if (metrics.audioQuality.packetLoss > 3) {
      suggestions.push('High packet loss detected. Check network stability.');
      networkRecommendations.enableAdaptation = true;
      networkRecommendations.suggestedBitrate = Math.max(32, metrics.audioQuality.bitrate * 0.7);
    }

    if (metrics.networkQuality.latency > 200) {
      suggestions.push('High latency detected. Consider switching networks.');
      networkRecommendations.enableAdaptation = true;
    }

    if (metrics.audioQuality.jitter > 50) {
      suggestions.push('Network jitter affecting call quality.');
      networkRecommendations.suggestedCodec = 'opus'; // Better jitter handling
    }

    if (metrics.networkQuality.bandwidth < 100) {
      suggestions.push('Low bandwidth detected. Audio quality may be reduced.');
      networkRecommendations.suggestedBitrate = 32; // Minimum bitrate
      networkRecommendations.suggestedCodec = 'pcmu'; // Lower bandwidth codec
    }

    // Add general suggestions based on rating
    switch (rating) {
      case QualityRating.POOR:
      case QualityRating.UNACCEPTABLE:
        suggestions.push('Consider ending and restarting the call.');
        suggestions.push('Try moving to a location with better network coverage.');
        networkRecommendations.enableAdaptation = true;
        break;
      
      case QualityRating.FAIR:
        suggestions.push('Call quality is acceptable but could be improved.');
        networkRecommendations.enableAdaptation = true;
        break;
    }

    return {
      sessionId: metrics.sessionId,
      rating,
      timestamp: new Date(),
      suggestions,
      networkRecommendations
    };
  }

  // Map quality rating to quality level
  private mapRatingToQualityLevel(rating: QualityRating): QualityLevel {
    switch (rating) {
      case QualityRating.EXCELLENT:
      case QualityRating.GOOD:
        return QualityLevel.HIGH;
      case QualityRating.FAIR:
        return QualityLevel.MEDIUM;
      case QualityRating.POOR:
        return QualityLevel.LOW;
      case QualityRating.UNACCEPTABLE:
        return QualityLevel.MINIMAL;
      default:
        return QualityLevel.MEDIUM;
    }
  }

  // Get call statistics (privacy-compliant)
  getCallStatistics(sessionId: AnonymousSessionId): {
    duration: number;
    averageQuality: number;
    qualityRating: QualityRating;
    networkStability: number;
    totalMetrics: number;
  } | null {
    const metrics = this.qualityMetrics.get(sessionId);
    if (!metrics || metrics.length === 0) {
      return null;
    }

    const firstMetric = metrics[0];
    const lastMetric = metrics[metrics.length - 1];
    const duration = lastMetric.timestamp.getTime() - firstMetric.timestamp.getTime();

    const averageQuality = metrics.reduce((sum, m) => sum + m.overallScore, 0) / metrics.length;
    const averageStability = metrics.reduce((sum, m) => sum + m.networkQuality.stability, 0) / metrics.length;

    const currentRating = this.assessQualityRating(lastMetric);

    return {
      duration,
      averageQuality,
      qualityRating: currentRating,
      networkStability: averageStability,
      totalMetrics: metrics.length
    };
  }

  // Clean up old metrics
  cleanupOldMetrics(olderThanMs: number = 3600000): number { // Default: 1 hour
    const cutoffTime = new Date(Date.now() - olderThanMs);
    let cleanedCount = 0;

    for (const [sessionId, metrics] of this.qualityMetrics) {
      const filteredMetrics = metrics.filter(m => m.timestamp > cutoffTime);
      
      if (filteredMetrics.length !== metrics.length) {
        if (filteredMetrics.length === 0) {
          this.qualityMetrics.delete(sessionId);
        } else {
          this.qualityMetrics.set(sessionId, filteredMetrics);
        }
        cleanedCount += metrics.length - filteredMetrics.length;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Old quality metrics cleaned up', { cleanedCount });
    }

    return cleanedCount;
  }

  // Get system health status
  getSystemHealth(): {
    activeMonitoringSessions: number;
    totalMetricsStored: number;
    averageSystemQuality: number;
    activeTimeouts: number;
  } {
    let totalMetrics = 0;
    let totalQualityScore = 0;
    let qualityMeasurements = 0;

    for (const metrics of this.qualityMetrics.values()) {
      totalMetrics += metrics.length;
      for (const metric of metrics) {
        totalQualityScore += metric.overallScore;
        qualityMeasurements++;
      }
    }

    const averageSystemQuality = qualityMeasurements > 0 ? totalQualityScore / qualityMeasurements : 0;

    return {
      activeMonitoringSessions: this.qualityCheckIntervals.size,
      totalMetricsStored: totalMetrics,
      averageSystemQuality,
      activeTimeouts: Array.from(this.activeTimeouts.values()).reduce((sum, timeouts) => sum + timeouts.length, 0)
    };
  }
}

// Global call quality manager instance
export const callQualityManager = new CallQualityManager();

// Utility functions
export function startCallQualityMonitoring(
  sessionId: AnonymousSessionId,
  onTimeout: (reason: string) => Promise<void>,
  onQualityChange?: (feedback: QualityFeedback) => Promise<void>
): void {
  callQualityManager.startCallMonitoring(sessionId, onTimeout, onQualityChange);
}

export function stopCallQualityMonitoring(sessionId: AnonymousSessionId): void {
  callQualityManager.stopCallMonitoring(sessionId);
}

export function recordCallQuality(metrics: CallQualityMetrics): void {
  callQualityManager.recordQualityMetrics(metrics);
}

export function getCallStats(sessionId: AnonymousSessionId) {
  return callQualityManager.getCallStatistics(sessionId);
}