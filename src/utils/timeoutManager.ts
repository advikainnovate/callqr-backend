/**
 * Timeout management system for call sessions and operations
 * 
 * Provides configurable timeout mechanisms with proper cleanup
 * to prevent resource leaks and hanging sessions.
 */

import { logger } from './logger';
import { ErrorFactory } from './errors';
import { AnonymousSessionId } from './types';

// Timeout types
export enum TimeoutType {
  CALL_SETUP = 'CALL_SETUP',
  CALL_DURATION = 'CALL_DURATION',
  CALL_RINGING = 'CALL_RINGING',
  API_REQUEST = 'API_REQUEST',
  DATABASE_OPERATION = 'DATABASE_OPERATION',
  WEBRTC_CONNECTION = 'WEBRTC_CONNECTION'
}

// Timeout configuration
export interface TimeoutConfig {
  duration: number;           // Timeout duration in milliseconds
  onTimeout: () => Promise<void> | void;  // Cleanup function
  onWarning?: () => Promise<void> | void; // Warning function (called at 80% of timeout)
  retryable: boolean;         // Whether operation can be retried
  description?: string;       // Human-readable description
}

// Timeout entry
interface TimeoutEntry {
  id: string;
  type: TimeoutType;
  config: TimeoutConfig;
  timer: NodeJS.Timeout;
  warningTimer?: NodeJS.Timeout;
  startTime: Date;
  sessionId?: AnonymousSessionId;
}

// Default timeout configurations
const DEFAULT_TIMEOUTS: Record<TimeoutType, Omit<TimeoutConfig, 'onTimeout'>> = {
  [TimeoutType.CALL_SETUP]: {
    duration: 30000,        // 30 seconds
    retryable: true,
    description: 'Call setup timeout'
  },
  [TimeoutType.CALL_DURATION]: {
    duration: 3600000,      // 1 hour
    retryable: false,
    description: 'Maximum call duration'
  },
  [TimeoutType.CALL_RINGING]: {
    duration: 45000,        // 45 seconds
    retryable: false,
    description: 'Call ringing timeout'
  },
  [TimeoutType.API_REQUEST]: {
    duration: 30000,        // 30 seconds
    retryable: true,
    description: 'API request timeout'
  },
  [TimeoutType.DATABASE_OPERATION]: {
    duration: 10000,        // 10 seconds
    retryable: true,
    description: 'Database operation timeout'
  },
  [TimeoutType.WEBRTC_CONNECTION]: {
    duration: 20000,        // 20 seconds
    retryable: true,
    description: 'WebRTC connection timeout'
  }
};

// Timeout manager class
export class TimeoutManager {
  private timeouts: Map<string, TimeoutEntry> = new Map();
  private nextId: number = 1;

  // Create a new timeout
  createTimeout(
    type: TimeoutType,
    config: Partial<TimeoutConfig> & { onTimeout: () => Promise<void> | void },
    sessionId?: AnonymousSessionId
  ): string {
    const id = `timeout_${this.nextId++}`;
    const defaultConfig = DEFAULT_TIMEOUTS[type];
    const fullConfig: TimeoutConfig = {
      ...defaultConfig,
      ...config
    };

    // Create warning timer (at 80% of timeout duration)
    let warningTimer: NodeJS.Timeout | undefined;
    if (fullConfig.onWarning) {
      const warningDelay = fullConfig.duration * 0.8;
      warningTimer = setTimeout(async () => {
        try {
          await fullConfig.onWarning!();
        } catch (error) {
          logger.warn('Timeout warning handler failed', {
            timeoutId: id,
            type,
            error: (error as Error).message
          });
        }
      }, warningDelay);
    }

    // Create main timeout timer
    const timer = setTimeout(async () => {
      await this.handleTimeout(id);
    }, fullConfig.duration);

    const entry: TimeoutEntry = {
      id,
      type,
      config: fullConfig,
      timer,
      warningTimer,
      startTime: new Date(),
      sessionId
    };

    this.timeouts.set(id, entry);

    logger.debug('Timeout created', {
      timeoutId: id,
      type,
      duration: fullConfig.duration,
      sessionId,
      description: fullConfig.description
    });

    return id;
  }

  // Handle timeout expiration
  private async handleTimeout(timeoutId: string): Promise<void> {
    const entry = this.timeouts.get(timeoutId);
    if (!entry) {
      return;
    }

    const duration = Date.now() - entry.startTime.getTime();

    logger.warn('Timeout expired', {
      timeoutId,
      type: entry.type,
      duration,
      sessionId: entry.sessionId,
      description: entry.config.description
    });

    try {
      // Execute cleanup function
      await entry.config.onTimeout();
    } catch (error) {
      logger.error('Timeout cleanup handler failed', {
        timeoutId,
        type: entry.type,
        error: (error as Error).message,
        sessionId: entry.sessionId
      });
    }

    // Remove the timeout entry
    this.removeTimeout(timeoutId);
  }

  // Cancel a timeout
  cancelTimeout(timeoutId: string): boolean {
    const entry = this.timeouts.get(timeoutId);
    if (!entry) {
      return false;
    }

    clearTimeout(entry.timer);
    if (entry.warningTimer) {
      clearTimeout(entry.warningTimer);
    }

    this.timeouts.delete(timeoutId);

    logger.debug('Timeout cancelled', {
      timeoutId,
      type: entry.type,
      sessionId: entry.sessionId
    });

    return true;
  }

  // Remove timeout entry (internal use)
  private removeTimeout(timeoutId: string): void {
    const entry = this.timeouts.get(timeoutId);
    if (entry) {
      clearTimeout(entry.timer);
      if (entry.warningTimer) {
        clearTimeout(entry.warningTimer);
      }
      this.timeouts.delete(timeoutId);
    }
  }

  // Cancel all timeouts for a session
  cancelSessionTimeouts(sessionId: AnonymousSessionId): number {
    let cancelledCount = 0;
    
    for (const [timeoutId, entry] of this.timeouts) {
      if (entry.sessionId === sessionId) {
        this.cancelTimeout(timeoutId);
        cancelledCount++;
      }
    }

    if (cancelledCount > 0) {
      logger.info('Session timeouts cancelled', {
        sessionId,
        cancelledCount
      });
    }

    return cancelledCount;
  }

  // Get timeout information
  getTimeoutInfo(timeoutId: string): {
    type: TimeoutType;
    remainingTime: number;
    elapsedTime: number;
    sessionId?: AnonymousSessionId;
    description?: string;
  } | null {
    const entry = this.timeouts.get(timeoutId);
    if (!entry) {
      return null;
    }

    const elapsedTime = Date.now() - entry.startTime.getTime();
    const remainingTime = Math.max(0, entry.config.duration - elapsedTime);

    return {
      type: entry.type,
      remainingTime,
      elapsedTime,
      sessionId: entry.sessionId,
      description: entry.config.description
    };
  }

  // Get all active timeouts
  getActiveTimeouts(): Array<{
    id: string;
    type: TimeoutType;
    remainingTime: number;
    sessionId?: AnonymousSessionId;
    description?: string;
  }> {
    const activeTimeouts = [];
    
    for (const [id, entry] of this.timeouts) {
      const elapsedTime = Date.now() - entry.startTime.getTime();
      const remainingTime = Math.max(0, entry.config.duration - elapsedTime);
      
      activeTimeouts.push({
        id,
        type: entry.type,
        remainingTime,
        sessionId: entry.sessionId,
        description: entry.config.description
      });
    }

    return activeTimeouts;
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    description?: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms: ${description || 'Unknown operation'}`));
      }, timeoutMs);

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

  /**
   * Set call timeout for a session
   */
  setCallTimeout(
    sessionId: AnonymousSessionId,
    timeoutMs: number,
    onTimeout: () => Promise<void> | void
  ): string {
    return this.createTimeout(
      TimeoutType.CALL_DURATION,
      {
        duration: timeoutMs,
        onTimeout,
        description: `Call timeout for session ${sessionId}`
      },
      sessionId
    );
  }

  /**
   * Clear call timeout for a session
   */
  clearCallTimeout(sessionId: AnonymousSessionId): number {
    return this.cancelSessionTimeouts(sessionId);
  }
  clearAllTimeouts(): number {
    const count = this.timeouts.size;
    
    for (const entry of this.timeouts.values()) {
      clearTimeout(entry.timer);
      if (entry.warningTimer) {
        clearTimeout(entry.warningTimer);
      }
    }
    
    this.timeouts.clear();
    
    if (count > 0) {
      logger.info('All timeouts cleared', { count });
    }
    
    return count;
  }

  // Get statistics
  getStats(): {
    activeTimeouts: number;
    timeoutsByType: Record<TimeoutType, number>;
    timeoutsBySessions: Record<string, number>;
  } {
    const stats = {
      activeTimeouts: this.timeouts.size,
      timeoutsByType: {} as Record<TimeoutType, number>,
      timeoutsBySessions: {} as Record<string, number>
    };

    // Initialize type counts
    for (const type of Object.values(TimeoutType)) {
      stats.timeoutsByType[type] = 0;
    }

    // Count timeouts by type and session
    for (const entry of this.timeouts.values()) {
      stats.timeoutsByType[entry.type]++;
      
      if (entry.sessionId) {
        const sessionKey = entry.sessionId;
        stats.timeoutsBySessions[sessionKey] = (stats.timeoutsBySessions[sessionKey] || 0) + 1;
      }
    }

    return stats;
  }
}

// Global timeout manager instance
export const timeoutManager = new TimeoutManager();

// Utility functions for common timeout scenarios

// Create call setup timeout
export function createCallSetupTimeout(
  sessionId: AnonymousSessionId,
  onTimeout: () => Promise<void> | void,
  onWarning?: () => Promise<void> | void
): string {
  return timeoutManager.createTimeout(
    TimeoutType.CALL_SETUP,
    {
      onTimeout,
      onWarning,
      description: `Call setup timeout for session ${sessionId}`
    },
    sessionId
  );
}

// Create call duration timeout
export function createCallDurationTimeout(
  sessionId: AnonymousSessionId,
  onTimeout: () => Promise<void> | void,
  maxDuration?: number
): string {
  return timeoutManager.createTimeout(
    TimeoutType.CALL_DURATION,
    {
      duration: maxDuration,
      onTimeout,
      onWarning: () => {
        logger.info('Call approaching maximum duration', { sessionId });
      },
      description: `Call duration timeout for session ${sessionId}`
    },
    sessionId
  );
}

// Create ringing timeout
export function createRingingTimeout(
  sessionId: AnonymousSessionId,
  onTimeout: () => Promise<void> | void
): string {
  return timeoutManager.createTimeout(
    TimeoutType.CALL_RINGING,
    {
      onTimeout,
      description: `Call ringing timeout for session ${sessionId}`
    },
    sessionId
  );
}

// Create API request timeout
export function createApiTimeout(
  onTimeout: () => Promise<void> | void,
  duration?: number
): string {
  return timeoutManager.createTimeout(
    TimeoutType.API_REQUEST,
    {
      duration,
      onTimeout,
      description: 'API request timeout'
    }
  );
}

// Create database operation timeout
export function createDatabaseTimeout(
  onTimeout: () => Promise<void> | void,
  operation?: string
): string {
  return timeoutManager.createTimeout(
    TimeoutType.DATABASE_OPERATION,
    {
      onTimeout,
      description: `Database operation timeout${operation ? ` for ${operation}` : ''}`
    }
  );
}

// Promise wrapper with timeout
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(ErrorFactory.serviceUnavailable());
    }, timeoutMs);

    promise
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