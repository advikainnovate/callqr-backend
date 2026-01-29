/**
 * Call Flow Orchestrator
 * 
 * Orchestrates the complete end-to-end call flow from QR scan to call completion.
 * Handles all scenarios, error cases, and ensures privacy compliance throughout.
 * 
 * Requirements: All requirements integration
 */

import { EventEmitter } from 'events';
import { SystemIntegration } from './systemIntegration';
import { SecureToken } from '../security/types';
import { AnonymousSessionId } from '../utils/types';
import { CallStatus } from '../routing/types';
import { logger } from '../utils/logger';
import { circuitBreakerManager } from '../utils/circuitBreaker';
import { withGracefulDegradation } from '../utils/gracefulDegradation';
import { timeoutManager } from '../utils/timeoutManager';

export interface CallFlowStep {
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp: Date;
  error?: string;
  data?: any;
}

export interface CallFlowResult {
  success: boolean;
  sessionId?: AnonymousSessionId;
  steps: CallFlowStep[];
  error?: string;
  duration: number;
}

export interface CallFlowContext {
  qrData: string;
  callerAnonymousId?: string;
  extractedToken?: SecureToken;
  sessionId?: AnonymousSessionId;
  startTime: Date;
  steps: CallFlowStep[];
}

export class CallFlowOrchestrator extends EventEmitter {
  private systemIntegration: SystemIntegration;
  private activeFlows: Map<string, CallFlowContext>;

  constructor(systemIntegration: SystemIntegration) {
    super();
    this.systemIntegration = systemIntegration;
    this.activeFlows = new Map();
  }

  /**
   * Execute complete end-to-end call flow
   */
  public async executeCallFlow(
    qrData: string,
    callerAnonymousId?: string
  ): Promise<CallFlowResult> {
    const flowId = this.generateFlowId();
    const context: CallFlowContext = {
      qrData,
      callerAnonymousId,
      startTime: new Date(),
      steps: []
    };

    this.activeFlows.set(flowId, context);

    try {
      // Step 1: Validate QR Code Format
      await this.executeStep(context, 'validate_qr_format', async () => {
        await this.validateQRFormat(context);
      });

      // Step 2: Extract Token
      await this.executeStep(context, 'extract_token', async () => {
        await this.extractToken(context);
      });

      // Step 3: Validate Token
      await this.executeStep(context, 'validate_token', async () => {
        await this.validateToken(context);
      });

      // Step 4: Create Anonymous Session
      await this.executeStep(context, 'create_session', async () => {
        await this.createAnonymousSession(context);
      });

      // Step 5: Initialize WebRTC
      await this.executeStep(context, 'initialize_webrtc', async () => {
        await this.initializeWebRTC(context);
      });

      // Step 6: Setup Call Monitoring
      await this.executeStep(context, 'setup_monitoring', async () => {
        await this.setupCallMonitoring(context);
      });

      const duration = Date.now() - context.startTime.getTime();
      const result: CallFlowResult = {
        success: true,
        sessionId: context.sessionId,
        steps: context.steps,
        duration
      };

      this.emit('call-flow-completed', flowId, result);
      return result;

    } catch (error) {
      const duration = Date.now() - context.startTime.getTime();
      const result: CallFlowResult = {
        success: false,
        steps: context.steps,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration
      };

      this.emit('call-flow-failed', flowId, result);
      return result;

    } finally {
      this.activeFlows.delete(flowId);
    }
  }

  /**
   * Handle call termination flow
   */
  public async executeCallTermination(sessionId: AnonymousSessionId): Promise<CallFlowResult> {
    const flowId = this.generateFlowId();
    const context: CallFlowContext = {
      qrData: '',
      sessionId,
      startTime: new Date(),
      steps: []
    };

    try {
      // Step 1: Validate Session
      await this.executeStep(context, 'validate_session', async () => {
        await this.validateSession(context);
      });

      // Step 2: End WebRTC Call
      await this.executeStep(context, 'end_webrtc', async () => {
        await this.endWebRTCCall(context);
      });

      // Step 3: Cleanup Session
      await this.executeStep(context, 'cleanup_session', async () => {
        await this.cleanupSession(context);
      });

      // Step 4: Privacy Cleanup
      await this.executeStep(context, 'privacy_cleanup', async () => {
        await this.privacyCleanup(context);
      });

      const duration = Date.now() - context.startTime.getTime();
      const result: CallFlowResult = {
        success: true,
        sessionId: context.sessionId,
        steps: context.steps,
        duration
      };

      this.emit('call-termination-completed', flowId, result);
      return result;

    } catch (error) {
      const duration = Date.now() - context.startTime.getTime();
      const result: CallFlowResult = {
        success: false,
        steps: context.steps,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration
      };

      this.emit('call-termination-failed', flowId, result);
      return result;
    }
  }

  /**
   * Execute a single step in the call flow
   */
  private async executeStep(
    context: CallFlowContext,
    stepName: string,
    stepFunction: () => Promise<void>
  ): Promise<void> {
    const step: CallFlowStep = {
      step: stepName,
      status: 'pending',
      timestamp: new Date()
    };

    context.steps.push(step);
    step.status = 'in_progress';

    try {
      // Execute with timeout
      await timeoutManager.executeWithTimeout(
        stepFunction,
        30000, // 30 second timeout per step
        `Call flow step: ${stepName}`
      );

      step.status = 'completed';
      this.emit('step-completed', stepName, step);

    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`Call flow step failed: ${stepName}`, {
        error: step.error,
        context: this.sanitizeContext(context)
      });

      this.emit('step-failed', stepName, step);
      throw error;
    }
  }

  /**
   * Step 1: Validate QR Code Format
   */
  private async validateQRFormat(context: CallFlowContext): Promise<void> {
    const services = this.systemIntegration.getServices();
    
    if (!context.qrData || typeof context.qrData !== 'string') {
      throw new Error('Invalid QR data format');
    }

    // Check QR format pattern
    if (!context.qrData.match(/^pqc:\d+:[a-f0-9]{64}:[a-f0-9]{8}$/)) {
      throw new Error('QR code format not recognized');
    }

    logger.debug('QR format validation passed', {
      format: context.qrData.substring(0, 20) + '...'
    });
  }

  /**
   * Step 2: Extract Token from QR Data
   */
  private async extractToken(context: CallFlowContext): Promise<void> {
    const services = this.systemIntegration.getServices();
    
    const token = services.tokenManager.extractTokenFromQR(context.qrData);
    if (!token) {
      throw new Error('Failed to extract token from QR code');
    }

    context.extractedToken = token;
    
    logger.debug('Token extracted successfully', {
      tokenVersion: token.version,
      tokenLength: token.value.length
    });
  }

  /**
   * Step 3: Validate Token
   */
  private async validateToken(context: CallFlowContext): Promise<void> {
    if (!context.extractedToken) {
      throw new Error('No token to validate');
    }

    const services = this.systemIntegration.getServices();
    
    // Use circuit breaker for token validation
    const validationResult = await circuitBreakerManager.execute(
      'token-validation',
      async () => {
        return await services.tokenManager.validateToken(context.extractedToken!.value);
      }
    );

    if (!validationResult.isValid) {
      throw new Error('Token validation failed: Invalid or expired token');
    }

    logger.debug('Token validation passed');
  }

  /**
   * Step 4: Create Anonymous Session
   */
  private async createAnonymousSession(context: CallFlowContext): Promise<void> {
    if (!context.extractedToken) {
      throw new Error('No validated token for session creation');
    }

    const services = this.systemIntegration.getServices();
    
    // Use circuit breaker for call initiation
    const callResult = await circuitBreakerManager.execute(
      'call-initiation',
      async () => {
        return await services.callRouter.initiateCall({
          scannedToken: context.extractedToken!,
          callerAnonymousId: context.callerAnonymousId as any
        });
      }
    );

    if (!callResult.success) {
      throw new Error(`Session creation failed: ${callResult.error}`);
    }

    context.sessionId = callResult.sessionId;
    
    logger.info('Anonymous session created', {
      sessionId: context.sessionId,
      callerAnonymousId: callResult.callerAnonymousId,
      calleeAnonymousId: callResult.calleeAnonymousId
    });
  }

  /**
   * Step 5: Initialize WebRTC
   */
  private async initializeWebRTC(context: CallFlowContext): Promise<void> {
    if (!context.sessionId) {
      throw new Error('No session ID for WebRTC initialization');
    }

    // Use circuit breaker for WebRTC initialization
    await circuitBreakerManager.execute(
      'webrtc-initialization',
      async () => {
        const { webrtcEngine } = await import('../webrtc/webrtcEngine');
        await webrtcEngine.initializeCall(context.sessionId!);
      }
    );

    logger.info('WebRTC initialized', {
      sessionId: context.sessionId
    });
  }

  /**
   * Step 6: Setup Call Monitoring
   */
  private async setupCallMonitoring(context: CallFlowContext): Promise<void> {
    if (!context.sessionId) {
      throw new Error('No session ID for call monitoring');
    }

    // Setup call timeout
    timeoutManager.setCallTimeout(
      context.sessionId,
      30 * 60 * 1000, // 30 minutes
      async () => {
        logger.warn('Call timeout reached', { sessionId: context.sessionId });
        await this.executeCallTermination(context.sessionId!);
      }
    );

    // Setup quality monitoring
    const { startCallQualityMonitoring } = await import('../utils/callQualityManager');
    startCallQualityMonitoring(
      context.sessionId,
      async (reason: string) => {
        logger.warn('Call quality timeout', { sessionId: context.sessionId, reason });
        await this.executeCallTermination(context.sessionId!);
      },
      async (feedback: any) => {
        this.emit('quality-feedback', context.sessionId, feedback);
      }
    );

    logger.debug('Call monitoring setup completed', {
      sessionId: context.sessionId
    });
  }

  /**
   * Validate session exists for termination
   */
  private async validateSession(context: CallFlowContext): Promise<void> {
    if (!context.sessionId) {
      throw new Error('No session ID provided');
    }

    const services = this.systemIntegration.getServices();
    const session = services.callRouter.getCallSession(context.sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status === CallStatus.ENDED) {
      throw new Error('Session already ended');
    }

    logger.debug('Session validation passed', {
      sessionId: context.sessionId,
      status: session.status
    });
  }

  /**
   * End WebRTC call
   */
  private async endWebRTCCall(context: CallFlowContext): Promise<void> {
    if (!context.sessionId) {
      throw new Error('No session ID for WebRTC termination');
    }

    try {
      const { webrtcEngine } = await import('../webrtc/webrtcEngine');
      await webrtcEngine.endCall(context.sessionId);
      
      logger.info('WebRTC call ended', {
        sessionId: context.sessionId
      });
    } catch (error) {
      // Log error but don't fail the termination flow
      logger.error('WebRTC termination error', {
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Cleanup session
   */
  private async cleanupSession(context: CallFlowContext): Promise<void> {
    if (!context.sessionId) {
      throw new Error('No session ID for cleanup');
    }

    const services = this.systemIntegration.getServices();
    
    const terminateResult = await services.callRouter.terminateCall(context.sessionId);
    if (!terminateResult.success) {
      logger.warn('Session cleanup warning', {
        sessionId: context.sessionId,
        error: terminateResult.error
      });
    }

    // Clear timeouts
    timeoutManager.clearCallTimeout(context.sessionId);
    
    const { stopCallQualityMonitoring } = await import('../utils/callQualityManager');
    stopCallQualityMonitoring(context.sessionId);

    logger.info('Session cleanup completed', {
      sessionId: context.sessionId
    });
  }

  /**
   * Privacy cleanup
   */
  private async privacyCleanup(context: CallFlowContext): Promise<void> {
    if (!context.sessionId) {
      return;
    }

    // Cleanup any temporary data
    const services = this.systemIntegration.getServices();
    services.privacyLayer.cleanupSessionData(context.sessionId);

    logger.debug('Privacy cleanup completed', {
      sessionId: context.sessionId
    });
  }

  /**
   * Generate unique flow ID
   */
  private generateFlowId(): string {
    return `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sanitize context for logging (remove sensitive data)
   */
  private sanitizeContext(context: CallFlowContext): any {
    return {
      qrDataLength: context.qrData?.length || 0,
      hasToken: !!context.extractedToken,
      sessionId: context.sessionId,
      stepCount: context.steps.length,
      duration: Date.now() - context.startTime.getTime()
    };
  }

  /**
   * Get active flow statistics
   */
  public getActiveFlowStats(): {
    activeFlows: number;
    averageDuration: number;
    successRate: number;
  } {
    // This would be implemented with proper metrics collection
    return {
      activeFlows: this.activeFlows.size,
      averageDuration: 0,
      successRate: 0
    };
  }
}

export default CallFlowOrchestrator;