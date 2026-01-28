/**
 * Simple Integration Service
 * 
 * A simplified integration service that wires together the core components
 * without complex orchestration to avoid type conflicts.
 * 
 * Requirements: All requirements integration
 */

import { AuthService } from '../auth/authService';
import { TokenManager } from '../security/tokenManager';
import { CallRouter } from '../routing/callRouter';
import { TokenMapper } from '../routing/tokenMapper';
import { SessionManager } from '../routing/sessionManager';
import { PrivacyLayer } from '../routing/privacyLayer';
import { webrtcEngine } from '../webrtc/webrtcEngine';
import { InMemoryTokenStorage } from '../security/tokenStorage';
import { PostgreSQLUserStorage } from '../auth/userStorage';
import { logger } from '../utils/logger';

export interface SimpleIntegrationConfig {
  database: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
  };
  auth: {
    requireMFA: boolean;
    passwordPepper?: string;
    jwtSecret: string;
    sessionDurationHours: number;
  };
}

export class SimpleIntegration {
  private authService?: AuthService;
  private tokenManager?: TokenManager;
  private callRouter?: CallRouter;
  private tokenMapper?: TokenMapper;
  private sessionManager?: SessionManager;
  private privacyLayer?: PrivacyLayer;
  private isInitialized = false;

  /**
   * Initialize the integration with core services
   */
  public async initialize(config: SimpleIntegrationConfig): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Simple integration already initialized');
      return;
    }

    try {
      logger.info('Starting simple integration initialization...');

      // Initialize core services
      await this.initializeCoreServices(config);

      // Initialize WebRTC engine
      await this.initializeWebRTC();

      this.isInitialized = true;
      logger.info('Simple integration initialization completed successfully');

    } catch (error) {
      logger.error('Simple integration initialization failed:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Get initialized services
   */
  public getServices() {
    if (!this.isInitialized) {
      throw new Error('Simple integration not initialized');
    }

    return {
      authService: this.authService!,
      tokenManager: this.tokenManager!,
      callRouter: this.callRouter!,
      tokenMapper: this.tokenMapper!,
      sessionManager: this.sessionManager!,
      privacyLayer: this.privacyLayer!,
    };
  }

  /**
   * Process simple call flow
   */
  public async processCallFlow(scannedToken: string, callerAnonymousId?: string): Promise<{
    success: boolean;
    sessionId?: string;
    error?: string;
  }> {
    if (!this.isInitialized) {
      return { success: false, error: 'Integration not initialized' };
    }

    try {
      // Extract token from QR data
      const token = this.tokenManager!.extractTokenFromQR(scannedToken);
      if (!token) {
        return { success: false, error: 'Invalid QR code format' };
      }

      // Validate token
      const validationResult = await this.tokenManager!.validateToken(token.value);
      if (!validationResult.isValid) {
        return { success: false, error: 'Invalid or expired token' };
      }

      // Initiate call through router
      const callResult = await this.callRouter!.initiateCall({
        scannedToken: token,
        callerAnonymousId: callerAnonymousId as any
      });

      if (!callResult.success) {
        return { success: false, error: callResult.error };
      }

      return {
        success: true,
        sessionId: callResult.sessionId as string
      };

    } catch (error) {
      logger.error('Call flow processing failed:', error as Record<string, unknown>);
      return { success: false, error: 'Call processing failed' };
    }
  }

  /**
   * Health check for services
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
    errors: string[];
  }> {
    const services: Record<string, boolean> = {};
    const errors: string[] = [];

    try {
      // Check auth service
      services.auth = this.authService !== undefined;
      if (!services.auth) {
        errors.push('Auth service not initialized');
      }

      // Check token manager
      services.tokenManager = this.tokenManager !== undefined;
      if (!services.tokenManager) {
        errors.push('Token manager not initialized');
      }

      // Check call router
      services.callRouter = this.callRouter !== undefined;
      if (!services.callRouter) {
        errors.push('Call router not initialized');
      }

      // Check WebRTC engine
      services.webrtc = webrtcEngine !== undefined;
      if (!services.webrtc) {
        errors.push('WebRTC engine not initialized');
      }

      // Determine overall status
      const healthyServices = Object.values(services).filter(Boolean).length;
      const totalServices = Object.keys(services).length;
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (healthyServices === totalServices) {
        status = 'healthy';
      } else if (healthyServices >= totalServices * 0.7) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return { status, services, errors };

    } catch (error) {
      logger.error('Health check failed:', error as Record<string, unknown>);
      return {
        status: 'unhealthy',
        services,
        errors: [...errors, 'Health check failed']
      };
    }
  }

  /**
   * Initialize core services
   */
  private async initializeCoreServices(config: SimpleIntegrationConfig): Promise<void> {
    // Initialize privacy layer first
    this.privacyLayer = new PrivacyLayer();

    // Initialize token storage and manager
    const tokenStorage = new InMemoryTokenStorage();
    this.tokenManager = new TokenManager(tokenStorage);

    // Initialize user storage and auth service
    const userStorage = new PostgreSQLUserStorage(config.database);
    this.authService = new AuthService({
      requireMFA: config.auth.requireMFA,
      passwordPepper: config.auth.passwordPepper,
      sessionConfig: {
        jwtSecret: config.auth.jwtSecret,
        sessionDurationHours: config.auth.sessionDurationHours,
        refreshThresholdHours: 2,
        maxConcurrentSessions: 5
      }
    }, userStorage);

    // Initialize routing services
    this.tokenMapper = new TokenMapper(this.tokenManager, this.privacyLayer);
    this.sessionManager = new SessionManager(this.privacyLayer);
    this.callRouter = new CallRouter(this.tokenMapper, this.sessionManager, this.privacyLayer);

    logger.info('Core services initialized successfully');
  }

  /**
   * Initialize WebRTC engine
   */
  private async initializeWebRTC(): Promise<void> {
    try {
      await webrtcEngine.initialize();
      logger.info('WebRTC engine initialized successfully');
    } catch (error) {
      logger.error('WebRTC initialization failed:', error as Record<string, unknown>);
      // Don't throw - allow system to work without WebRTC
    }
  }
}

export const simpleIntegration = new SimpleIntegration();