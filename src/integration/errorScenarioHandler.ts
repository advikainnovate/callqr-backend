/**
 * Error Scenario Handler
 * 
 * Handles various error scenarios and edge cases in the call flow.
 * Ensures graceful degradation and proper error recovery.
 * 
 * Requirements: All requirements integration, error handling
 */

import { EventEmitter } from 'events';
import { SystemIntegration } from './systemIntegration';
import { CallFlowOrchestrator } from './callFlowOrchestrator';
import { AnonymousSessionId } from '../utils/types';
import { CallStatus } from '../routing/types';
import { logger } from '../utils/logger';
import { circuitBreakerManager } from '../utils/circuitBreaker';
import { withGracefulDegradation } from '../utils/gracefulDegradation';

export enum ErrorScenario {
  INVALID_QR_FORMAT = 'invalid_qr_format',
  EXPIRED_TOKEN = 'expired_token',
  NETWORK_FAILURE = 'network_failure',
  WEBRTC_FAILURE = 'webrtc_failure',
  DATABASE_FAILURE = 'database_failure',
  AUTHENTICATION_FAILURE = 'authentication_failure',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SESSION_TIMEOUT = 'session_timeout',
  PRIVACY_VIOLATION = 'privacy_violation',
  RESOURCE_EXHAUSTION = 'resource_exhaustion'
}

export interface ErrorScenarioResult {
  scenario: ErrorScenario;
  handled: boolean;
  action: string;
  message: string;
  recovery?: string;
  retryable: boolean;
}

export class ErrorScenarioHandler extends EventEmitter {
  private systemIntegration: SystemIntegration;
  private callFlowOrchestrator: CallFlowOrchestrator;
  private errorCounts: Map<ErrorScenario, number>;
  private lastErrorTimes: Map<ErrorScenario, Date>;

  constructor(
    systemIntegration: SystemIntegration,
    callFlowOrchestrator: CallFlowOrchestrator
  ) {
    super();
    this.systemIntegration = systemIntegration;
    this.callFlowOrchestrator = callFlowOrchestrator;
    this.errorCounts = new Map();
    this.lastErrorTimes = new Map();
    this.setupErrorHandlers();
  }

  /**
   * Handle specific error scenario
   */
  public async handleErrorScenario(
    scenario: ErrorScenario,
    context: any = {}
  ): Promise<ErrorScenarioResult> {
    this.incrementErrorCount(scenario);
    
    try {
      switch (scenario) {
        case ErrorScenario.INVALID_QR_FORMAT:
          return await this.handleInvalidQRFormat(context);
        
        case ErrorScenario.EXPIRED_TOKEN:
          return await this.handleExpiredToken(context);
        
        case ErrorScenario.NETWORK_FAILURE:
          return await this.handleNetworkFailure(context);
        
        case ErrorScenario.WEBRTC_FAILURE:
          return await this.handleWebRTCFailure(context);
        
        case ErrorScenario.DATABASE_FAILURE:
          return await this.handleDatabaseFailure(context);
        
        case ErrorScenario.AUTHENTICATION_FAILURE:
          return await this.handleAuthenticationFailure(context);
        
        case ErrorScenario.RATE_LIMIT_EXCEEDED:
          return await this.handleRateLimitExceeded(context);
        
        case ErrorScenario.SESSION_TIMEOUT:
          return await this.handleSessionTimeout(context);
        
        case ErrorScenario.PRIVACY_VIOLATION:
          return await this.handlePrivacyViolation(context);
        
        case ErrorScenario.RESOURCE_EXHAUSTION:
          return await this.handleResourceExhaustion(context);
        
        default:
          return await this.handleUnknownError(scenario, context);
      }
    } catch (error) {
      logger.error(`Error scenario handler failed: ${scenario}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: this.sanitizeContext(context)
      });

      return {
        scenario,
        handled: false,
        action: 'error_handler_failed',
        message: 'Error scenario handler encountered an error',
        retryable: false
      };
    }
  }

  /**
   * Handle invalid QR format
   */
  private async handleInvalidQRFormat(context: any): Promise<ErrorScenarioResult> {
    logger.warn('Invalid QR format detected', {
      qrDataLength: context.qrData?.length || 0,
      format: context.qrData?.substring(0, 20) || 'unknown'
    });

    return {
      scenario: ErrorScenario.INVALID_QR_FORMAT,
      handled: true,
      action: 'reject_request',
      message: 'QR code format is not recognized. Please scan a valid privacy calling QR code.',
      retryable: false
    };
  }

  /**
   * Handle expired token
   */
  private async handleExpiredToken(context: any): Promise<ErrorScenarioResult> {
    logger.warn('Expired token detected', {
      tokenId: context.tokenId || 'unknown',
      sessionId: context.sessionId || 'unknown'
    });

    // Clean up any partial session
    if (context.sessionId) {
      try {
        const services = this.systemIntegration.getServices();
        await services.callRouter.terminateCall(context.sessionId);
      } catch (error) {
        logger.error('Failed to cleanup expired token session', {
          sessionId: context.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      scenario: ErrorScenario.EXPIRED_TOKEN,
      handled: true,
      action: 'reject_request',
      message: 'QR code has expired. Please request a new QR code from the recipient.',
      recovery: 'Generate new QR code',
      retryable: false
    };
  }

  /**
   * Handle network failure
   */
  private async handleNetworkFailure(context: any): Promise<ErrorScenarioResult> {
    logger.error('Network failure detected', {
      endpoint: context.endpoint || 'unknown',
      error: context.error || 'unknown'
    });

    // Enable graceful degradation
    await withGracefulDegradation(
      async () => { /* no-op primary */ },
      async () => { /* fallback mode */ }
    );

    // Check if circuit breaker should be opened
    if (this.getErrorCount(ErrorScenario.NETWORK_FAILURE) > 5) {
      const breaker = circuitBreakerManager.getBreaker('network-operations');
      breaker.forceOpen();
    }

    return {
      scenario: ErrorScenario.NETWORK_FAILURE,
      handled: true,
      action: 'enable_degraded_mode',
      message: 'Network connectivity issues detected. Operating in degraded mode.',
      recovery: 'Retry when network is restored',
      retryable: true
    };
  }

  /**
   * Handle WebRTC failure
   */
  private async handleWebRTCFailure(context: any): Promise<ErrorScenarioResult> {
    logger.error('WebRTC failure detected', {
      sessionId: context.sessionId || 'unknown',
      error: context.error || 'unknown'
    });

    // Attempt to cleanup WebRTC resources
    if (context.sessionId) {
      try {
        const { webrtcEngine } = await import('../webrtc/webrtcEngine');
        await webrtcEngine.endCall(context.sessionId);
      } catch (error) {
        logger.error('Failed to cleanup WebRTC resources', {
          sessionId: context.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Terminate the call session
    if (context.sessionId) {
      try {
        const services = this.systemIntegration.getServices();
        await services.callRouter.terminateCall(context.sessionId);
      } catch (error) {
        logger.error('Failed to terminate call after WebRTC failure', {
          sessionId: context.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      scenario: ErrorScenario.WEBRTC_FAILURE,
      handled: true,
      action: 'terminate_call',
      message: 'Call connection failed. The call has been terminated.',
      recovery: 'Try calling again',
      retryable: true
    };
  }

  /**
   * Handle database failure
   */
  private async handleDatabaseFailure(context: any): Promise<ErrorScenarioResult> {
    logger.error('Database failure detected', {
      operation: context.operation || 'unknown',
      error: context.error || 'unknown'
    });

    // Enable graceful degradation for database operations
    await withGracefulDegradation(
      async () => { /* no-op primary */ },
      async () => { /* fallback mode */ }
    );

    // Open circuit breaker for database operations
    const breaker = circuitBreakerManager.getBreaker('database-operations');
    breaker.forceOpen();

    return {
      scenario: ErrorScenario.DATABASE_FAILURE,
      handled: true,
      action: 'enable_degraded_mode',
      message: 'Database connectivity issues. Some features may be limited.',
      recovery: 'Retry when database is restored',
      retryable: true
    };
  }

  /**
   * Handle authentication failure
   */
  private async handleAuthenticationFailure(context: any): Promise<ErrorScenarioResult> {
    logger.warn('Authentication failure detected', {
      userId: context.userId || 'unknown',
      reason: context.reason || 'unknown'
    });

    // Implement progressive lockout
    const errorCount = this.getErrorCount(ErrorScenario.AUTHENTICATION_FAILURE);
    let lockoutMinutes = 0;
    
    if (errorCount > 3) {
      lockoutMinutes = Math.min(errorCount * 2, 60); // Max 60 minutes
    }

    return {
      scenario: ErrorScenario.AUTHENTICATION_FAILURE,
      handled: true,
      action: 'reject_authentication',
      message: lockoutMinutes > 0 
        ? `Authentication failed. Please try again in ${lockoutMinutes} minutes.`
        : 'Authentication failed. Please check your credentials.',
      recovery: lockoutMinutes > 0 ? `Wait ${lockoutMinutes} minutes` : 'Check credentials',
      retryable: lockoutMinutes === 0
    };
  }

  /**
   * Handle rate limit exceeded
   */
  private async handleRateLimitExceeded(context: any): Promise<ErrorScenarioResult> {
    logger.warn('Rate limit exceeded', {
      endpoint: context.endpoint || 'unknown',
      clientId: context.clientId || 'unknown'
    });

    const resetTime = context.resetTime || new Date(Date.now() + 60000); // Default 1 minute
    const waitMinutes = Math.ceil((resetTime.getTime() - Date.now()) / 60000);

    return {
      scenario: ErrorScenario.RATE_LIMIT_EXCEEDED,
      handled: true,
      action: 'reject_request',
      message: `Rate limit exceeded. Please try again in ${waitMinutes} minute(s).`,
      recovery: `Wait ${waitMinutes} minutes`,
      retryable: true
    };
  }

  /**
   * Handle session timeout
   */
  private async handleSessionTimeout(context: any): Promise<ErrorScenarioResult> {
    logger.info('Session timeout detected', {
      sessionId: context.sessionId || 'unknown',
      duration: context.duration || 'unknown'
    });

    // Cleanup timed out session
    if (context.sessionId) {
      try {
        await this.callFlowOrchestrator.executeCallTermination(context.sessionId);
      } catch (error) {
        logger.error('Failed to cleanup timed out session', {
          sessionId: context.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      scenario: ErrorScenario.SESSION_TIMEOUT,
      handled: true,
      action: 'terminate_session',
      message: 'Call session has timed out and been terminated.',
      recovery: 'Start a new call',
      retryable: true
    };
  }

  /**
   * Handle privacy violation
   */
  private async handlePrivacyViolation(context: any): Promise<ErrorScenarioResult> {
    logger.error('Privacy violation detected', {
      violation: context.violation || 'unknown',
      sessionId: context.sessionId || 'unknown'
    });

    // Immediately terminate any active session
    if (context.sessionId) {
      try {
        const services = this.systemIntegration.getServices();
        await services.callRouter.terminateCall(context.sessionId);
      } catch (error) {
        logger.error('Failed to terminate session after privacy violation', {
          sessionId: context.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Alert security team (in production, this would trigger alerts)
    this.emit('security-alert', {
      type: 'privacy_violation',
      context: this.sanitizeContext(context),
      timestamp: new Date()
    });

    return {
      scenario: ErrorScenario.PRIVACY_VIOLATION,
      handled: true,
      action: 'terminate_and_alert',
      message: 'Privacy violation detected. Session terminated for security.',
      retryable: false
    };
  }

  /**
   * Handle resource exhaustion
   */
  private async handleResourceExhaustion(context: any): Promise<ErrorScenarioResult> {
    logger.error('Resource exhaustion detected', {
      resource: context.resource || 'unknown',
      usage: context.usage || 'unknown'
    });

    // Enable graceful degradation
    await withGracefulDegradation(
      async () => { /* no-op primary */ },
      async () => { /* fallback mode */ }
    );

    // Reject new requests temporarily
    const breaker = circuitBreakerManager.getBreaker('resource-intensive-operations');
    breaker.forceOpen();

    return {
      scenario: ErrorScenario.RESOURCE_EXHAUSTION,
      handled: true,
      action: 'reject_new_requests',
      message: 'System is currently at capacity. Please try again later.',
      recovery: 'Try again in a few minutes',
      retryable: true
    };
  }

  /**
   * Handle unknown error
   */
  private async handleUnknownError(
    scenario: ErrorScenario,
    context: any
  ): Promise<ErrorScenarioResult> {
    logger.error('Unknown error scenario', {
      scenario,
      context: this.sanitizeContext(context)
    });

    return {
      scenario,
      handled: false,
      action: 'log_and_reject',
      message: 'An unexpected error occurred. Please try again.',
      retryable: true
    };
  }

  /**
   * Setup error handlers
   */
  private setupErrorHandlers(): void {
    // Note: Circuit breaker events would be handled differently with the manager
    // For now, we'll set up basic error handling
    
    this.on('error', (error) => {
      logger.error('Error scenario handler error:', error);
    });
  }

  /**
   * Increment error count for scenario
   */
  private incrementErrorCount(scenario: ErrorScenario): void {
    const currentCount = this.errorCounts.get(scenario) || 0;
    this.errorCounts.set(scenario, currentCount + 1);
    this.lastErrorTimes.set(scenario, new Date());
  }

  /**
   * Get error count for scenario
   */
  private getErrorCount(scenario: ErrorScenario): number {
    return this.errorCounts.get(scenario) || 0;
  }

  /**
   * Sanitize context for logging
   */
  private sanitizeContext(context: any): any {
    const sanitized = { ...context };
    
    // Remove sensitive data
    delete sanitized.token;
    delete sanitized.password;
    delete sanitized.credentials;
    
    // Truncate long strings
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 100) {
        sanitized[key] = sanitized[key].substring(0, 100) + '...';
      }
    });
    
    return sanitized;
  }

  /**
   * Get error statistics
   */
  public getErrorStatistics(): {
    totalErrors: number;
    errorsByScenario: Record<string, number>;
    recentErrors: Array<{ scenario: ErrorScenario; timestamp: Date }>;
  } {
    const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
    
    const errorsByScenario: Record<string, number> = {};
    this.errorCounts.forEach((count, scenario) => {
      errorsByScenario[scenario] = count;
    });

    const recentErrors = Array.from(this.lastErrorTimes.entries())
      .map(([scenario, timestamp]) => ({ scenario, timestamp }))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);

    return {
      totalErrors,
      errorsByScenario,
      recentErrors
    };
  }

  /**
   * Reset error counts (for testing or maintenance)
   */
  public resetErrorCounts(): void {
    this.errorCounts.clear();
    this.lastErrorTimes.clear();
    logger.info('Error counts reset');
  }
}

export default ErrorScenarioHandler;