/**
 * Mobile Call Flow Handler
 * 
 * Handles the complete end-to-end call flow from the mobile app perspective.
 * Coordinates QR scanning, call initiation, WebRTC setup, and call management.
 * 
 * Requirements: All requirements integration
 */

import { EventEmitter } from 'events';
import { 
  SecureToken, 
  QRScanResult, 
  QRScanError, 
  CallStatus, 
  CallDirection,
  AnonymousSessionId 
} from '../types';
import { AppIntegration, CallSession } from './appIntegration';
import { MobileTokenValidator } from '../utils/tokenValidator';
import { MobileErrorHandler } from '../utils/errorHandler';

export interface CallFlowStep {
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp: Date;
  error?: string;
}

export interface CallFlowResult {
  success: boolean;
  callSession?: CallSession;
  steps: CallFlowStep[];
  error?: string;
  duration: number;
}

export interface CallFlowOptions {
  enableQualityMonitoring?: boolean;
  callTimeoutMinutes?: number;
  retryAttempts?: number;
}

export class CallFlowHandler extends EventEmitter {
  private appIntegration: AppIntegration;
  private tokenValidator: MobileTokenValidator;
  private activeFlows: Map<string, CallFlowContext>;

  constructor(appIntegration: AppIntegration) {
    super();
    this.appIntegration = appIntegration;
    this.tokenValidator = new MobileTokenValidator();
    this.activeFlows = new Map();
    this.setupEventHandlers();
  }

  /**
   * Execute complete QR scan to call flow
   */
  public async executeQRScanToCall(
    scanResult: QRScanResult,
    options: CallFlowOptions = {}
  ): Promise<CallFlowResult> {
    const flowId = this.generateFlowId();
    const context: CallFlowContext = {
      flowId,
      scanResult,
      options,
      startTime: new Date(),
      steps: []
    };

    this.activeFlows.set(flowId, context);

    try {
      // Step 1: Validate Scan Result
      await this.executeStep(context, 'validate_scan_result', async () => {
        await this.validateScanResult(context);
      });

      // Step 2: Validate Token
      await this.executeStep(context, 'validate_token', async () => {
        await this.validateToken(context);
      });

      // Step 3: Initiate Call
      await this.executeStep(context, 'initiate_call', async () => {
        await this.initiateCall(context);
      });

      // Step 4: Setup WebRTC
      await this.executeStep(context, 'setup_webrtc', async () => {
        await this.setupWebRTC(context);
      });

      // Step 5: Monitor Call Quality
      if (options.enableQualityMonitoring !== false) {
        await this.executeStep(context, 'setup_monitoring', async () => {
          await this.setupCallMonitoring(context);
        });
      }

      const duration = Date.now() - context.startTime.getTime();
      const result: CallFlowResult = {
        success: true,
        callSession: context.callSession,
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
   * Execute incoming call flow
   */
  public async executeIncomingCallFlow(
    sessionId: AnonymousSessionId,
    options: CallFlowOptions = {}
  ): Promise<CallFlowResult> {
    const flowId = this.generateFlowId();
    const context: CallFlowContext = {
      flowId,
      sessionId,
      options,
      startTime: new Date(),
      steps: []
    };

    this.activeFlows.set(flowId, context);

    try {
      // Step 1: Handle Incoming Call
      await this.executeStep(context, 'handle_incoming', async () => {
        await this.handleIncomingCall(context);
      });

      // Step 2: Setup Call Interface
      await this.executeStep(context, 'setup_interface', async () => {
        await this.setupCallInterface(context);
      });

      // Step 3: Prepare WebRTC
      await this.executeStep(context, 'prepare_webrtc', async () => {
        await this.prepareWebRTC(context);
      });

      const duration = Date.now() - context.startTime.getTime();
      const result: CallFlowResult = {
        success: true,
        callSession: context.callSession,
        steps: context.steps,
        duration
      };

      this.emit('incoming-call-flow-completed', flowId, result);
      return result;

    } catch (error) {
      const duration = Date.now() - context.startTime.getTime();
      const result: CallFlowResult = {
        success: false,
        steps: context.steps,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration
      };

      this.emit('incoming-call-flow-failed', flowId, result);
      return result;

    } finally {
      this.activeFlows.delete(flowId);
    }
  }

  /**
   * Execute call termination flow
   */
  public async executeCallTermination(): Promise<CallFlowResult> {
    const currentCall = this.appIntegration.getCurrentCall();
    if (!currentCall) {
      return {
        success: false,
        steps: [],
        error: 'No active call to terminate',
        duration: 0
      };
    }

    const flowId = this.generateFlowId();
    const context: CallFlowContext = {
      flowId,
      callSession: currentCall,
      startTime: new Date(),
      steps: []
    };

    try {
      // Step 1: End Call
      await this.executeStep(context, 'end_call', async () => {
        await this.endCall(context);
      });

      // Step 2: Cleanup WebRTC
      await this.executeStep(context, 'cleanup_webrtc', async () => {
        await this.cleanupWebRTC(context);
      });

      // Step 3: Cleanup UI
      await this.executeStep(context, 'cleanup_ui', async () => {
        await this.cleanupUI(context);
      });

      const duration = Date.now() - context.startTime.getTime();
      const result: CallFlowResult = {
        success: true,
        callSession: context.callSession,
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
      await stepFunction();
      step.status = 'completed';
      this.emit('step-completed', stepName, step);

    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`Call flow step failed: ${stepName}`, step.error);
      this.emit('step-failed', stepName, step);
      throw error;
    }
  }

  /**
   * Step 1: Validate Scan Result
   */
  private async validateScanResult(context: CallFlowContext): Promise<void> {
    if (!context.scanResult) {
      throw new Error('No scan result provided');
    }

    if (!context.scanResult.success) {
      throw new Error(`Scan failed: ${context.scanResult.error}`);
    }

    if (!context.scanResult.token) {
      throw new Error('No token in scan result');
    }

    console.log('Scan result validation passed');
  }

  /**
   * Step 2: Validate Token
   */
  private async validateToken(context: CallFlowContext): Promise<void> {
    if (!context.scanResult?.token) {
      throw new Error('No token to validate');
    }

    const validationResult = this.tokenValidator.validateToken(context.scanResult.token.value);
    if (!validationResult.isValid) {
      throw new Error(`Token validation failed: ${validationResult.error}`);
    }

    console.log('Token validation passed');
  }

  /**
   * Step 3: Initiate Call
   */
  private async initiateCall(context: CallFlowContext): Promise<void> {
    if (!context.scanResult) {
      throw new Error('No scan result for call initiation');
    }

    const callSession = await this.appIntegration.processQRScan(context.scanResult);
    context.callSession = callSession;

    console.log('Call initiated successfully', {
      sessionId: callSession.sessionId,
      direction: callSession.direction
    });
  }

  /**
   * Step 4: Setup WebRTC
   */
  private async setupWebRTC(context: CallFlowContext): Promise<void> {
    if (!context.callSession) {
      throw new Error('No call session for WebRTC setup');
    }

    // WebRTC setup would be handled by the app integration
    // This is a placeholder for WebRTC-specific setup
    console.log('WebRTC setup completed', {
      sessionId: context.callSession.sessionId
    });
  }

  /**
   * Step 5: Setup Call Monitoring
   */
  private async setupCallMonitoring(context: CallFlowContext): Promise<void> {
    if (!context.callSession) {
      throw new Error('No call session for monitoring setup');
    }

    const timeoutMinutes = context.options?.callTimeoutMinutes || 30;
    
    // Setup call timeout
    setTimeout(() => {
      if (this.appIntegration.getCurrentCall()?.sessionId === context.callSession?.sessionId) {
        console.warn('Call timeout reached', { sessionId: context.callSession?.sessionId });
        this.executeCallTermination();
      }
    }, timeoutMinutes * 60 * 1000);

    console.log('Call monitoring setup completed', {
      sessionId: context.callSession.sessionId,
      timeoutMinutes
    });
  }

  /**
   * Handle incoming call
   */
  private async handleIncomingCall(context: CallFlowContext): Promise<void> {
    if (!context.sessionId) {
      throw new Error('No session ID for incoming call');
    }

    const callSession = await this.appIntegration.handleIncomingCall(context.sessionId);
    context.callSession = callSession;

    console.log('Incoming call handled', {
      sessionId: callSession.sessionId
    });
  }

  /**
   * Setup call interface
   */
  private async setupCallInterface(context: CallFlowContext): Promise<void> {
    if (!context.callSession) {
      throw new Error('No call session for interface setup');
    }

    // Interface setup would be handled by the UI components
    console.log('Call interface setup completed');
  }

  /**
   * Prepare WebRTC for incoming call
   */
  private async prepareWebRTC(context: CallFlowContext): Promise<void> {
    if (!context.callSession) {
      throw new Error('No call session for WebRTC preparation');
    }

    // WebRTC preparation for incoming calls
    console.log('WebRTC preparation completed');
  }

  /**
   * End call
   */
  private async endCall(context: CallFlowContext): Promise<void> {
    await this.appIntegration.endCall();
    console.log('Call ended successfully');
  }

  /**
   * Cleanup WebRTC
   */
  private async cleanupWebRTC(context: CallFlowContext): Promise<void> {
    // WebRTC cleanup would be handled by the app integration
    console.log('WebRTC cleanup completed');
  }

  /**
   * Cleanup UI
   */
  private async cleanupUI(context: CallFlowContext): Promise<void> {
    // UI cleanup would be handled by the components
    console.log('UI cleanup completed');
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.appIntegration.on('call-status-changed', (callSession: CallSession) => {
      this.emit('call-status-changed', callSession);
    });

    this.appIntegration.on('quality-feedback', (feedback: any) => {
      this.emit('quality-feedback', feedback);
    });

    this.appIntegration.on('error', (error: Error) => {
      MobileErrorHandler.fromNetworkError(error as Error);
    });
  }

  /**
   * Generate unique flow ID
   */
  private generateFlowId(): string {
    return `mobile_flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get active flow statistics
   */
  public getActiveFlowStats(): {
    activeFlows: number;
    completedFlows: number;
    failedFlows: number;
  } {
    return {
      activeFlows: this.activeFlows.size,
      completedFlows: 0, // Would be tracked with proper metrics
      failedFlows: 0     // Would be tracked with proper metrics
    };
  }
}

interface CallFlowContext {
  flowId: string;
  scanResult?: QRScanResult;
  sessionId?: AnonymousSessionId;
  callSession?: CallSession;
  options?: CallFlowOptions;
  startTime: Date;
  steps: CallFlowStep[];
}

export default CallFlowHandler;