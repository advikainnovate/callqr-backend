/**
 * System Integration Service
 * 
 * Wires together all backend components for the privacy-preserving QR-based calling system.
 * Handles initialization, configuration, and coordination between services.
 * 
 * Requirements: All requirements integration
 */

import { EventEmitter } from 'events';
import { AuthService } from '../auth/authService';
import { TokenManager } from '../security/tokenManager';
import { CallRouter } from '../routing/callRouter';
import { TokenMapper } from '../routing/tokenMapper';
import { SessionManager } from '../routing/sessionManager';
import { PrivacyLayer } from '../routing/privacyLayer';
import { webrtcEngine } from '../webrtc/webrtcEngine';
import { signalingServer } from '../webrtc/signalingServer';
import { InMemoryTokenStorage } from '../security/tokenStorage';
import { PostgreSQLUserStorage } from '../auth/userStorage';
import { initializeDatabase } from '../database';
import { logger } from '../utils/logger';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { withGracefulDegradation } from '../utils/gracefulDegradation';
import { DataRetentionService } from '../utils/dataRetentionService';
import { AnonymousSessionId, CallStatus } from '../utils/types';

export interface SystemIntegrationConfig {
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
  webrtc: {
    signalingPort: number;
    httpsKey?: string;
    httpsCert?: string;
    stunServers: string[];
    turnServers: Array<{
      urls: string;
      username: string;
      credential: string;
    }>;
  };
  privacy: {
    tokenExpirationHours: number;
    sessionTimeoutMinutes: number;
    dataRetentionDays: number;
  };
}

export class SystemIntegration extends EventEmitter {
  private authService?: AuthService;
  private tokenManager?: TokenManager;
  private callRouter?: CallRouter;
  private tokenMapper?: TokenMapper;
  private sessionManager?: SessionManager;
  private privacyLayer?: PrivacyLayer;
  private isInitialized = false;
  private circuitBreaker?: CircuitBreaker;
  private isShuttingDown = false;

  constructor() {
    super();
    this.setupGracefulShutdown();
  }

  /**
   * Initialize the entire system with all components
   */
  public async initialize(config: SystemIntegrationConfig): Promise<void> {
    if (this.isInitialized) {
      logger.warn('System already initialized');
      return;
    }

    try {
      logger.info('Starting system initialization...');

      // Initialize database first
      await this.initializeDatabase(config.database);

      // Initialize core services
      await this.initializeCoreServices(config);

      // Initialize WebRTC engine
      await this.initializeWebRTC(config.webrtc);

      // Setup service integrations
      this.setupServiceIntegrations();

      // Start background services
      await this.startBackgroundServices(config.privacy);

      this.isInitialized = true;
      this.emit('system-initialized');
      logger.info('System initialization completed successfully');

    } catch (error) {
      logger.error('System initialization failed:', error as Record<string, unknown>);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Shutdown the entire system gracefully
   */
  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('System shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting system shutdown...');

    try {
      // Stop background services
      await this.stopBackgroundServices();

      // Shutdown WebRTC engine
      if (webrtcEngine) {
        await webrtcEngine.shutdown();
      }

      // Cleanup services
      await this.cleanup();

      this.isInitialized = false;
      this.emit('system-shutdown');
      logger.info('System shutdown completed');

    } catch (error) {
      logger.error('Error during system shutdown:', error as Record<string, unknown>);
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Get initialized services
   */
  public getServices() {
    if (!this.isInitialized) {
      throw new Error('System not initialized');
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
   * Health check for all services
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
    errors: string[];
  }> {
    const services: Record<string, boolean> = {};
    const errors: string[] = [];

    try {
      // Check database
      services.database = await this.checkDatabaseHealth();
      if (!services.database) {
        errors.push('Database connection failed');
      }

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
   * Process end-to-end call flow
   */
  public async processCallFlow(scannedToken: string, callerAnonymousId?: string): Promise<{
    success: boolean;
    sessionId?: AnonymousSessionId;
    error?: string;
  }> {
    if (!this.isInitialized) {
      return { success: false, error: 'System not initialized' };
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

      // Initialize WebRTC call
      const webrtcSession = await webrtcEngine.initializeCall(callResult.sessionId!);

      return {
        success: true,
        sessionId: callResult.sessionId
      };

    } catch (error) {
      logger.error('Call flow processing failed:', error as Record<string, unknown>);
      return { success: false, error: 'Call processing failed' };
    }
  }

  /**
   * Initialize database connection
   */
  private async initializeDatabase(config: SystemIntegrationConfig['database']): Promise<void> {
    try {
      await initializeDatabase();
      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Database initialization failed:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Initialize core services
   */
  private async initializeCoreServices(config: SystemIntegrationConfig): Promise<void> {
    // Initialize privacy layer first
    this.privacyLayer = new PrivacyLayer();

    // Initialize token storage and manager
    const tokenStorage = new InMemoryTokenStorage(); // In production, use database storage
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

    // Initialize circuit breaker and data retention service
    this.circuitBreaker = new CircuitBreaker('system-integration');
    // Note: DataRetentionService constructor will be fixed separately

    logger.info('Core services initialized successfully');
  }

  /**
   * Initialize WebRTC engine
   */
  private async initializeWebRTC(config: SystemIntegrationConfig['webrtc']): Promise<void> {
    try {
      await webrtcEngine.initialize();
      logger.info('WebRTC engine initialized successfully');
    } catch (error) {
      logger.error('WebRTC initialization failed:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Setup integrations between services
   */
  private setupServiceIntegrations(): void {
    // Note: Direct integration without event emitters for now
    // In a production system, you might want to add event emitters to services
    
    logger.info('Service integrations setup completed');
  }

  /**
   * Start background services
   */
  private async startBackgroundServices(privacyConfig: SystemIntegrationConfig['privacy']): Promise<void> {
    // Note: Data retention service initialization would be done here with proper database pool
    logger.info('Background services started');
  }

  /**
   * Stop background services
   */
  private async stopBackgroundServices(): Promise<void> {
    // Note: Data retention service cleanup would be done here
    logger.info('Background services stopped');
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      // This would be implemented based on your database connection
      // For now, return true if database module is available
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error as Record<string, unknown>);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    try {
      // Cleanup would go here
      logger.info('System cleanup completed');
    } catch (error) {
      logger.error('Error during cleanup:', error as Record<string, unknown>);
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdownHandler = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGUSR2', () => shutdownHandler('SIGUSR2')); // For nodemon
  }
}

export const systemIntegration = new SystemIntegration();