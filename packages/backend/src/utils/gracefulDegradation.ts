/**
 * Graceful degradation utilities for handling network issues and service failures
 * 
 * Provides fallback mechanisms and quality adaptation for maintaining service
 * availability during adverse conditions.
 */

import { logger } from './logger';
import { ErrorFactory } from './errors';

// Service quality levels
export enum QualityLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  MINIMAL = 'MINIMAL'
}

// Network condition assessment
export interface NetworkCondition {
  quality: QualityLevel;
  latency: number;        // ms
  bandwidth: number;      // kbps
  packetLoss: number;     // percentage
  jitter: number;         // ms
  timestamp: Date;
}

// Service degradation configuration
export interface DegradationConfig {
  enableFallback: boolean;
  fallbackTimeout: number;
  qualityThresholds: {
    high: NetworkCondition;
    medium: NetworkCondition;
    low: NetworkCondition;
  };
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
}

// Default degradation configuration
const DEFAULT_DEGRADATION_CONFIG: DegradationConfig = {
  enableFallback: true,
  fallbackTimeout: 5000,
  qualityThresholds: {
    high: {
      quality: QualityLevel.HIGH,
      latency: 100,
      bandwidth: 1000,
      packetLoss: 1,
      jitter: 20,
      timestamp: new Date()
    },
    medium: {
      quality: QualityLevel.MEDIUM,
      latency: 300,
      bandwidth: 500,
      packetLoss: 3,
      jitter: 50,
      timestamp: new Date()
    },
    low: {
      quality: QualityLevel.LOW,
      latency: 1000,
      bandwidth: 100,
      packetLoss: 10,
      jitter: 100,
      timestamp: new Date()
    }
  },
  retryPolicy: {
    maxRetries: 3,
    backoffMultiplier: 2,
    initialDelay: 1000
  }
};

// Graceful degradation manager
export class GracefulDegradationManager {
  private currentQuality: QualityLevel = QualityLevel.HIGH;
  private networkCondition?: NetworkCondition;
  private config: DegradationConfig;

  constructor(config: Partial<DegradationConfig> = {}) {
    this.config = { ...DEFAULT_DEGRADATION_CONFIG, ...config };
  }

  // Update network condition and adjust quality
  updateNetworkCondition(condition: NetworkCondition): void {
    this.networkCondition = condition;
    this.currentQuality = this.assessQuality(condition);
    
    logger.info('Network condition updated', {
      quality: this.currentQuality,
      latency: condition.latency,
      bandwidth: condition.bandwidth,
      packetLoss: condition.packetLoss
    });
  }

  // Assess quality level based on network condition
  private assessQuality(condition: NetworkCondition): QualityLevel {
    const { qualityThresholds } = this.config;

    if (
      condition.latency <= qualityThresholds.high.latency &&
      condition.bandwidth >= qualityThresholds.high.bandwidth &&
      condition.packetLoss <= qualityThresholds.high.packetLoss
    ) {
      return QualityLevel.HIGH;
    }

    if (
      condition.latency <= qualityThresholds.medium.latency &&
      condition.bandwidth >= qualityThresholds.medium.bandwidth &&
      condition.packetLoss <= qualityThresholds.medium.packetLoss
    ) {
      return QualityLevel.MEDIUM;
    }

    if (
      condition.latency <= qualityThresholds.low.latency &&
      condition.bandwidth >= qualityThresholds.low.bandwidth &&
      condition.packetLoss <= qualityThresholds.low.packetLoss
    ) {
      return QualityLevel.LOW;
    }

    return QualityLevel.MINIMAL;
  }

  // Execute with graceful degradation
  async executeWithDegradation<T>(
    primaryFn: () => Promise<T>,
    fallbackFn?: () => Promise<T>,
    options?: {
      requiresHighQuality?: boolean;
      allowDegradation?: boolean;
    }
  ): Promise<T> {
    const { requiresHighQuality = false, allowDegradation = true } = options || {};

    // Check if current quality meets requirements
    if (requiresHighQuality && this.currentQuality !== QualityLevel.HIGH) {
      throw ErrorFactory.networkIssue();
    }

    try {
      // Try primary function with retry policy
      return await this.executeWithRetry(primaryFn);
    } catch (error) {
      logger.warn('Primary function failed, attempting degradation', {
        error: (error as Error).message,
        currentQuality: this.currentQuality,
        allowDegradation
      });

      // Try fallback if available and degradation is allowed
      if (fallbackFn && allowDegradation && this.config.enableFallback) {
        try {
          logger.info('Executing fallback function');
          return await this.executeWithTimeout(fallbackFn, this.config.fallbackTimeout);
        } catch (fallbackError) {
          logger.error('Fallback function also failed', {
            error: (fallbackError as Error).message
          });
        }
      }

      // Re-throw original error if no fallback succeeded
      throw error;
    }
  }

  // Execute with retry policy
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    const { maxRetries, backoffMultiplier, initialDelay } = this.config.retryPolicy;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          break; // Don't wait after the last attempt
        }

        const delay = initialDelay * Math.pow(backoffMultiplier, attempt);
        logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
          error: lastError.message
        });

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  // Execute with timeout
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  // Sleep utility
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get current quality level
  getCurrentQuality(): QualityLevel {
    return this.currentQuality;
  }

  // Get network condition
  getNetworkCondition(): NetworkCondition | undefined {
    return this.networkCondition;
  }

  // Check if service should degrade
  shouldDegrade(): boolean {
    return this.currentQuality !== QualityLevel.HIGH;
  }

  // Get recommended settings for current quality
  getRecommendedSettings(): {
    audioCodec: string;
    videoBitrate?: number;
    audioSampleRate: number;
    enableEchoCancellation: boolean;
    enableNoiseSuppression: boolean;
  } {
    switch (this.currentQuality) {
      case QualityLevel.HIGH:
        return {
          audioCodec: 'opus',
          videoBitrate: 1000,
          audioSampleRate: 48000,
          enableEchoCancellation: true,
          enableNoiseSuppression: true
        };

      case QualityLevel.MEDIUM:
        return {
          audioCodec: 'opus',
          videoBitrate: 500,
          audioSampleRate: 24000,
          enableEchoCancellation: true,
          enableNoiseSuppression: true
        };

      case QualityLevel.LOW:
        return {
          audioCodec: 'pcmu',
          audioSampleRate: 16000,
          enableEchoCancellation: false,
          enableNoiseSuppression: true
        };

      case QualityLevel.MINIMAL:
        return {
          audioCodec: 'pcmu',
          audioSampleRate: 8000,
          enableEchoCancellation: false,
          enableNoiseSuppression: false
        };

      default:
        return {
          audioCodec: 'opus',
          audioSampleRate: 48000,
          enableEchoCancellation: true,
          enableNoiseSuppression: true
        };
    }
  }
}

// Network condition monitor
export class NetworkMonitor {
  private degradationManager: GracefulDegradationManager;
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring: boolean = false;

  constructor(degradationManager: GracefulDegradationManager) {
    this.degradationManager = degradationManager;
  }

  // Start monitoring network conditions
  startMonitoring(intervalMs: number = 10000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.assessNetworkCondition();
    }, intervalMs);

    logger.info('Network monitoring started');
  }

  // Stop monitoring
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
    logger.info('Network monitoring stopped');
  }

  // Assess current network condition
  private async assessNetworkCondition(): Promise<void> {
    try {
      // In a real implementation, this would measure actual network metrics
      // For now, we'll simulate based on system load or other indicators
      const condition = await this.measureNetworkMetrics();
      this.degradationManager.updateNetworkCondition(condition);
    } catch (error) {
      logger.warn('Failed to assess network condition', {
        error: (error as Error).message
      });
    }
  }

  // Measure network metrics (simplified implementation)
  private async measureNetworkMetrics(): Promise<NetworkCondition> {
    // This is a simplified implementation
    // In production, you would use actual network measurement tools
    
    const startTime = Date.now();
    
    try {
      // Simulate a network test (in real implementation, ping a known endpoint)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
      
      const latency = Date.now() - startTime;
      
      return {
        quality: QualityLevel.HIGH, // Will be assessed by degradation manager
        latency,
        bandwidth: 1000, // Would be measured in real implementation
        packetLoss: Math.random() * 2, // Would be measured
        jitter: Math.random() * 30, // Would be measured
        timestamp: new Date()
      };
    } catch (error) {
      // Return poor conditions if measurement fails
      return {
        quality: QualityLevel.MINIMAL,
        latency: 2000,
        bandwidth: 50,
        packetLoss: 15,
        jitter: 200,
        timestamp: new Date()
      };
    }
  }
}

// Global instances
export const gracefulDegradationManager = new GracefulDegradationManager();
export const networkMonitor = new NetworkMonitor(gracefulDegradationManager);

// Utility functions
export function withGracefulDegradation<T>(
  primaryFn: () => Promise<T>,
  fallbackFn?: () => Promise<T>,
  options?: {
    requiresHighQuality?: boolean;
    allowDegradation?: boolean;
  }
): Promise<T> {
  return gracefulDegradationManager.executeWithDegradation(primaryFn, fallbackFn, options);
}