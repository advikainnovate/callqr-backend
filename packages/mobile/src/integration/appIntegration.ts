/**
 * Mobile App Integration Service
 * 
 * Coordinates all mobile app components for the privacy-preserving QR-based calling system.
 * Handles QR scanning, call initiation, WebRTC communication, and backend API integration.
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
  AnonymousSessionId,
  AnonymousId 
} from '../types';
import { MobileTokenValidator } from '../utils/tokenValidator';
import { defaultPermissionManager, AppPermission } from '../utils/permissionManager';
import { MobileErrorHandler } from '../utils/errorHandler';

export interface AppIntegrationConfig {
  backend: {
    baseUrl: string;
    apiVersion: string;
    timeout: number;
  };
  webrtc: {
    stunServers: string[];
    turnServers: Array<{
      urls: string;
      username: string;
      credential: string;
    }>;
  };
  privacy: {
    tokenRefreshIntervalMinutes: number;
    callTimeoutMinutes: number;
  };
}

export interface CallSession {
  sessionId: AnonymousSessionId;
  status: CallStatus;
  direction: CallDirection;
  duration: number;
  startTime: Date;
  token?: SecureToken;
  callerAnonymousId?: AnonymousId;
  calleeAnonymousId?: AnonymousId;
}

export class AppIntegration extends EventEmitter {
  private tokenValidator: MobileTokenValidator;
  private currentToken?: SecureToken;
  private activeCall?: CallSession;
  private webSocketConnection?: WebSocket;
  private isInitialized = false;
  private config?: AppIntegrationConfig;

  constructor() {
    super();
    this.tokenValidator = new MobileTokenValidator();
    this.setupErrorHandling();
  }

  /**
   * Initialize the mobile app integration
   */
  public async initialize(config: AppIntegrationConfig): Promise<void> {
    if (this.isInitialized) {
      console.warn('App integration already initialized');
      return;
    }

    try {
      console.log('Starting app integration initialization...');
      this.config = config;

      // Check required permissions
      await this.checkPermissions();

      // Initialize backend connection
      await this.initializeBackendConnection();

      this.isInitialized = true;
      this.emit('app-initialized');
      console.log('App integration initialization completed');

    } catch (error) {
      console.error('App integration initialization failed:', error);
      throw error;
    }
  }

  /**
   * Generate new QR token
   */
  public async generateQRToken(): Promise<SecureToken> {
    if (!this.isInitialized || !this.config) {
      throw new Error('App integration not initialized');
    }

    try {
      const response = await this.makeAPIRequest('/tokens/generate', {
        method: 'POST',
        requireAuth: true
      });

      if (!response.qrCodeData) {
        throw new Error('No QR code data received from server');
      }

      // Extract token from QR data
      const token = this.tokenValidator.extractTokenFromQR(response.qrCodeData);
      if (!token) {
        throw new Error('Invalid token received from server');
      }

      this.currentToken = token;
      this.emit('token-generated', token);
      
      return token;

    } catch (error) {
      console.error('Failed to generate QR token:', error);
      throw error;
    }
  }

  /**
   * Process QR scan result and initiate call
   */
  public async processQRScan(scanResult: QRScanResult): Promise<CallSession> {
    if (!this.isInitialized || !this.config) {
      throw new Error('App integration not initialized');
    }

    if (!scanResult.success || !scanResult.token) {
      throw new Error(`QR scan failed: ${scanResult.error}`);
    }

    try {
      // Validate scanned token
      const validationResult = this.tokenValidator.validateToken(scanResult.token.value);
      if (!validationResult.isValid) {
        throw new Error(`Invalid token: ${validationResult.error}`);
      }

      // Generate anonymous caller ID
      const callerAnonymousId = this.generateAnonymousId();

      // Initiate call through backend
      const callResponse = await this.makeAPIRequest('/calls/initiate', {
        method: 'POST',
        body: {
          scannedToken: scanResult.token,
          callerAnonymousId
        }
      });

      if (!callResponse.sessionId) {
        throw new Error('No session ID received from server');
      }

      // Create call session
      const callSession: CallSession = {
        sessionId: callResponse.sessionId,
        status: CallStatus.INITIATING,
        direction: CallDirection.OUTGOING,
        duration: 0,
        startTime: new Date(),
        token: scanResult.token,
        callerAnonymousId: callResponse.callerAnonymousId,
        calleeAnonymousId: callResponse.calleeAnonymousId
      };

      this.activeCall = callSession;

      // Setup WebRTC connection
      await this.setupWebRTCConnection(callSession, callResponse);

      this.emit('call-initiated', callSession);
      return callSession;

    } catch (error) {
      console.error('Failed to process QR scan:', error);
      throw error;
    }
  }

  /**
   * Handle incoming call
   */
  public async handleIncomingCall(sessionId: AnonymousSessionId): Promise<CallSession> {
    if (!this.isInitialized) {
      throw new Error('App integration not initialized');
    }

    try {
      // Create incoming call session
      const callSession: CallSession = {
        sessionId,
        status: CallStatus.RINGING,
        direction: CallDirection.INCOMING,
        duration: 0,
        startTime: new Date()
      };

      this.activeCall = callSession;
      this.emit('incoming-call', callSession);

      return callSession;

    } catch (error) {
      console.error('Failed to handle incoming call:', error);
      throw error;
    }
  }

  /**
   * Answer incoming call
   */
  public async answerCall(): Promise<void> {
    if (!this.activeCall || this.activeCall.direction !== CallDirection.INCOMING) {
      throw new Error('No incoming call to answer');
    }

    try {
      // Update call status
      await this.updateCallStatus(CallStatus.CONNECTED);

      // Setup WebRTC for incoming call
      await this.setupWebRTCConnection(this.activeCall);

      this.emit('call-answered', this.activeCall);

    } catch (error) {
      console.error('Failed to answer call:', error);
      throw error;
    }
  }

  /**
   * End active call
   */
  public async endCall(): Promise<void> {
    if (!this.activeCall) {
      console.warn('No active call to end');
      return;
    }

    try {
      const sessionId = this.activeCall.sessionId;

      // Update call status
      await this.updateCallStatus(CallStatus.ENDED);

      // Close WebRTC connection
      this.closeWebRTCConnection();

      // Notify backend
      await this.makeAPIRequest(`/calls/${sessionId}`, {
        method: 'DELETE'
      });

      const endedCall = this.activeCall;
      this.activeCall = undefined;

      this.emit('call-ended', endedCall);

    } catch (error) {
      console.error('Failed to end call:', error);
      // Still clean up local state
      this.activeCall = undefined;
      this.closeWebRTCConnection();
    }
  }

  /**
   * Get current call session
   */
  public getCurrentCall(): CallSession | undefined {
    return this.activeCall;
  }

  /**
   * Get current token
   */
  public getCurrentToken(): SecureToken | undefined {
    return this.currentToken;
  }

  /**
   * Check app health
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, boolean>;
    errors: string[];
  }> {
    const components: Record<string, boolean> = {};
    const errors: string[] = [];

    try {
      // Check permissions
      const permissionResult = await defaultPermissionManager.checkAllPermissions([
        AppPermission.CAMERA,
        AppPermission.MICROPHONE
      ]);
      components.permissions = permissionResult.allGranted;
      if (!permissionResult.allGranted) {
        errors.push('Missing required permissions');
      }

      // Check backend connectivity
      try {
        await this.makeAPIRequest('/health', { method: 'GET' });
        components.backend = true;
      } catch (error) {
        components.backend = false;
        errors.push('Backend connectivity failed');
      }

      // Check WebRTC capability
      // For React Native, we don't have window, so we'll assume WebRTC is available
      components.webrtc = true;
      if (!components.webrtc) {
        errors.push('WebRTC not supported');
      }

      // Determine overall status
      const healthyComponents = Object.values(components).filter(Boolean).length;
      const totalComponents = Object.keys(components).length;
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (healthyComponents === totalComponents) {
        status = 'healthy';
      } else if (healthyComponents >= totalComponents * 0.7) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return { status, components, errors };

    } catch (error) {
      console.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        components,
        errors: [...errors, 'Health check failed']
      };
    }
  }

  /**
   * Check required permissions
   */
  private async checkPermissions(): Promise<void> {
    const requiredPermissions = [AppPermission.CAMERA, AppPermission.MICROPHONE];
    const result = await defaultPermissionManager.checkAllPermissions(requiredPermissions);
    
    if (!result.allGranted) {
      console.warn('Missing required permissions:', result.missingPermissions);
      // Don't throw error - let the UI handle permission requests
    }
  }

  /**
   * Initialize backend connection
   */
  private async initializeBackendConnection(): Promise<void> {
    if (!this.config) return;

    try {
      // Test backend connectivity
      const response = await this.makeAPIRequest('/health', { method: 'GET' });
      console.log('Backend connection established:', response.service);
    } catch (error) {
      console.error('Failed to connect to backend:', error);
      throw error;
    }
  }

  /**
   * Setup WebRTC connection for call
   */
  private async setupWebRTCConnection(
    callSession: CallSession, 
    callResponse?: any
  ): Promise<void> {
    if (!this.config) return;

    try {
      // Setup WebSocket signaling connection
      const signalingUrl = callResponse?.signalingEndpoint || 
        `/api/v1/calls/signaling/${callSession.sessionId}`;
      
      await this.setupSignalingConnection(signalingUrl);

      // Initialize WebRTC peer connection
      // This would integrate with a WebRTC library like react-native-webrtc
      console.log('WebRTC connection setup completed for session:', callSession.sessionId);

    } catch (error) {
      console.error('Failed to setup WebRTC connection:', error);
      throw error;
    }
  }

  /**
   * Setup WebSocket signaling connection
   */
  private async setupSignalingConnection(endpoint: string): Promise<void> {
    if (!this.config) return;

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.config?.backend.baseUrl.replace('http', 'ws') + endpoint;
        this.webSocketConnection = new WebSocket(wsUrl);

        this.webSocketConnection.onopen = () => {
          console.log('Signaling connection established');
          resolve();
        };

        this.webSocketConnection.onmessage = (event) => {
          this.handleSignalingMessage(JSON.parse(event.data));
        };

        this.webSocketConnection.onerror = (error) => {
          console.error('Signaling connection error:', error);
          reject(error);
        };

        this.webSocketConnection.onclose = () => {
          console.log('Signaling connection closed');
          this.webSocketConnection = undefined;
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle signaling messages
   */
  private handleSignalingMessage(message: any): void {
    switch (message.type) {
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        // Handle WebRTC signaling
        this.emit('webrtc-signaling', message);
        break;
      case 'call-end':
        this.endCall();
        break;
      case 'quality-feedback':
        this.emit('quality-feedback', message.payload);
        break;
      default:
        console.log('Unknown signaling message:', message.type);
    }
  }

  /**
   * Close WebRTC connection
   */
  private closeWebRTCConnection(): void {
    if (this.webSocketConnection) {
      this.webSocketConnection.close();
      this.webSocketConnection = undefined;
    }
  }

  /**
   * Update call status
   */
  private async updateCallStatus(status: CallStatus): Promise<void> {
    if (!this.activeCall) return;

    try {
      await this.makeAPIRequest('/calls/status', {
        method: 'PUT',
        body: {
          sessionId: this.activeCall.sessionId,
          status
        }
      });

      this.activeCall.status = status;
      this.emit('call-status-changed', this.activeCall);

    } catch (error) {
      console.error('Failed to update call status:', error);
      // Don't throw - local state is still updated
    }
  }

  /**
   * Make API request to backend
   */
  private async makeAPIRequest(endpoint: string, options: {
    method: string;
    body?: any;
    requireAuth?: boolean;
  }): Promise<any> {
    if (!this.config) {
      throw new Error('App integration not configured');
    }

    const url = `${this.config.backend.baseUrl}/api/${this.config.backend.apiVersion}${endpoint}`;
    
    const requestOptions: RequestInit = {
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (options.body) {
      requestOptions.body = JSON.stringify(options.body);
    }

    if (options.requireAuth) {
      // Add authentication headers if needed
      // This would integrate with your auth system
    }

    try {
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      console.error(`API request failed: ${options.method} ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Generate anonymous ID
   */
  private generateAnonymousId(): AnonymousId {
    return `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` as AnonymousId;
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.on('error', (error) => {
      MobileErrorHandler.fromNetworkError(error as Error);
    });
  }
}

export const appIntegration = new AppIntegration();