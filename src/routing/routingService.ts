/**
 * Routing Service Integration
 * 
 * Provides a high-level service that integrates all routing components
 * for easy use in the application.
 */

import { TokenManager } from '../security/tokenManager';
import { InMemoryTokenStorage } from '../security/tokenStorage';
import { 
  TokenMapper, 
  TokenMapperFactory,
  PrivacyLayer,
  PrivacyLayerFactory,
  SessionManager,
  SessionManagerFactory,
  CallRouter,
  CallRouterFactory,
  TokenProcessor,
  TokenProcessorFactory
} from './index';

/**
 * Routing service configuration
 */
export interface RoutingServiceConfig {
  readonly enableRateLimiting?: boolean;
  readonly enableAbuseDetection?: boolean;
  readonly enableLogging?: boolean;
  readonly maxActiveSessions?: number;
  readonly sessionTimeoutMinutes?: number;
}

/**
 * Integrated routing service
 */
export class RoutingService {
  private readonly tokenManager: TokenManager;
  private readonly tokenMapper: TokenMapper;
  private readonly privacyLayer: PrivacyLayer;
  private readonly sessionManager: SessionManager;
  private readonly callRouter: CallRouter;
  private readonly tokenProcessor: TokenProcessor;

  constructor(config: RoutingServiceConfig = {}) {
    // Initialize storage (in production, this would be a database)
    const tokenStorage = new InMemoryTokenStorage();
    
    // Initialize token manager
    this.tokenManager = new TokenManager(tokenStorage);
    
    // Initialize privacy layer
    this.privacyLayer = PrivacyLayerFactory.create({
      enableDataSanitization: true,
      logPrivacyViolations: config.enableLogging || false
    });
    
    // Initialize token mapper
    this.tokenMapper = TokenMapperFactory.create(
      this.tokenManager,
      this.privacyLayer,
      {
        enableLogging: config.enableLogging || false
      }
    );
    
    // Initialize session manager
    this.sessionManager = SessionManagerFactory.create(
      this.privacyLayer,
      {
        maxActiveSessions: config.maxActiveSessions || 1000,
        sessionTimeoutMinutes: config.sessionTimeoutMinutes || 60,
        enableSessionLogging: config.enableLogging || false
      }
    );
    
    // Initialize call router
    this.callRouter = CallRouterFactory.create(
      this.tokenMapper,
      this.sessionManager,
      this.privacyLayer,
      {
        enableCallLogging: config.enableLogging || false
      }
    );
    
    // Initialize token processor
    this.tokenProcessor = TokenProcessorFactory.create(
      this.callRouter,
      this.privacyLayer,
      {
        enableRateLimiting: config.enableRateLimiting !== false,
        enableAbuseDetection: config.enableAbuseDetection !== false,
        enableProcessingLogs: config.enableLogging || false
      }
    );
  }

  /**
   * Get token manager instance
   */
  getTokenManager(): TokenManager {
    return this.tokenManager;
  }

  /**
   * Get token mapper instance
   */
  getTokenMapper(): TokenMapper {
    return this.tokenMapper;
  }

  /**
   * Get privacy layer instance
   */
  getPrivacyLayer(): PrivacyLayer {
    return this.privacyLayer;
  }

  /**
   * Get session manager instance
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get call router instance
   */
  getCallRouter(): CallRouter {
    return this.callRouter;
  }

  /**
   * Get token processor instance
   */
  getTokenProcessor(): TokenProcessor {
    return this.tokenProcessor;
  }

  /**
   * Shutdown all services and cleanup resources
   */
  shutdown(): void {
    this.sessionManager.shutdown();
    this.tokenProcessor.shutdown();
  }
}

/**
 * Routing service factory
 */
export class RoutingServiceFactory {
  static create(config?: RoutingServiceConfig): RoutingService {
    return new RoutingService(config);
  }

  static createWithDefaults(): RoutingService {
    return new RoutingService();
  }
}