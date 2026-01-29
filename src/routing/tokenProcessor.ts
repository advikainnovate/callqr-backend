/**
 * Token Processing Flow
 * 
 * Handles secure token forwarding without local caching and implements
 * rate limiting and abuse prevention for the call routing system.
 * 
 * Requirements: 2.4, 2.5, 5.5
 */

import { SecureToken, AnonymousId } from '../security/types';
import { CallRouter, CallInitiationRequest, CallInitiationResult } from './callRouter';
import { PrivacyLayer } from './privacyLayer';

/**
 * Token processing request
 */
export interface TokenProcessingRequest {
  readonly token: SecureToken;
  readonly clientId?: string; // Optional client identifier for rate limiting
  readonly ipAddress?: string; // Optional IP address for rate limiting
  readonly userAgent?: string; // Optional user agent for logging
}

/**
 * Token processing result
 */
export interface TokenProcessingResult {
  readonly success: boolean;
  readonly sessionId?: string;
  readonly callerAnonymousId?: AnonymousId;
  readonly calleeAnonymousId?: AnonymousId;
  readonly error?: TokenProcessingError;
  readonly rateLimitInfo?: RateLimitInfo;
}

/**
 * Token processing error types
 */
export enum TokenProcessingError {
  RATE_LIMITED = 'RATE_LIMITED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  ABUSE_DETECTED = 'ABUSE_DETECTED',
  PRIVACY_VIOLATION = 'PRIVACY_VIOLATION'
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  readonly remaining: number;
  readonly resetTime: Date;
  readonly windowMinutes: number;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  readonly maxTokensPerMinute: number;
  readonly maxTokensPerHour: number;
  readonly maxTokensPerDay: number;
  readonly windowSizeMinutes: number;
  readonly abuseThreshold: number; // Requests that trigger abuse detection
  readonly blockDurationMinutes: number; // How long to block after abuse detection
}

/**
 * Default rate limiting configuration
 */
const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxTokensPerMinute: 10,
  maxTokensPerHour: 100,
  maxTokensPerDay: 500,
  windowSizeMinutes: 1,
  abuseThreshold: 50, // 50 requests in a short time triggers abuse detection
  blockDurationMinutes: 60 // 1 hour block
};

/**
 * Client rate limit tracking
 */
interface ClientRateLimit {
  readonly clientId: string;
  requests: Date[]; // Remove readonly to allow updates
  readonly blockedUntil?: Date;
  readonly abuseCount: number;
}

/**
 * Token processor configuration
 */
export interface TokenProcessorConfig {
  readonly enableRateLimiting: boolean;
  readonly enableAbuseDetection: boolean;
  readonly enableProcessingLogs: boolean;
  readonly rateLimitConfig: RateLimitConfig;
}

/**
 * Default token processor configuration
 */
const DEFAULT_CONFIG: TokenProcessorConfig = {
  enableRateLimiting: true,
  enableAbuseDetection: true,
  enableProcessingLogs: false, // Disabled by default for privacy
  rateLimitConfig: DEFAULT_RATE_LIMIT_CONFIG
};

/**
 * Token processor with rate limiting and abuse prevention
 */
export class TokenProcessor {
  private readonly config: TokenProcessorConfig;
  private readonly callRouter: CallRouter;
  private readonly privacyLayer: PrivacyLayer;
  private readonly clientLimits: Map<string, ClientRateLimit>;
  private readonly ipLimits: Map<string, ClientRateLimit>;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    callRouter: CallRouter,
    privacyLayer: PrivacyLayer,
    config: Partial<TokenProcessorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callRouter = callRouter;
    this.privacyLayer = privacyLayer;
    this.clientLimits = new Map();
    this.ipLimits = new Map();

    // Start cleanup timer for expired rate limit entries
    this.startCleanupTimer();
  }

  /**
   * Process token without local caching
   * 
   * @param request - Token processing request
   * @returns Promise resolving to TokenProcessingResult
   */
  async processToken(request: TokenProcessingRequest): Promise<TokenProcessingResult> {
    try {
      const { token, clientId, ipAddress, userAgent } = request;

      // Step 1: Rate limiting check
      if (this.config.enableRateLimiting) {
        const rateLimitResult = this.checkRateLimit(clientId, ipAddress);
        
        if (!rateLimitResult.allowed) {
          return {
            success: false,
            error: TokenProcessingError.RATE_LIMITED,
            rateLimitInfo: rateLimitResult.info
          };
        }
      }

      // Step 2: Abuse detection
      if (this.config.enableAbuseDetection) {
        const abuseResult = this.checkAbusePattern(clientId, ipAddress);
        
        if (abuseResult.detected) {
          return {
            success: false,
            error: TokenProcessingError.ABUSE_DETECTED
          };
        }
      }

      // Step 3: Privacy validation of token
      const privacyValidation = this.privacyLayer.validatePrivacyCompliance(token);
      
      if (!privacyValidation.compliant) {
        return {
          success: false,
          error: TokenProcessingError.PRIVACY_VIOLATION
        };
      }

      // Step 4: Process token through call router (no local caching)
      const callRequest: CallInitiationRequest = {
        scannedToken: token
      };

      const callResult = await this.callRouter.initiateCall(callRequest);

      // Step 5: Update rate limiting counters
      if (this.config.enableRateLimiting) {
        this.updateRateLimitCounters(clientId, ipAddress);
      }

      // Step 6: Log processing (privacy-compliant)
      if (this.config.enableProcessingLogs) {
        this.logTokenProcessing(callResult.success, clientId, ipAddress, userAgent);
      }

      // Step 7: Return result
      if (callResult.success) {
        return {
          success: true,
          sessionId: callResult.sessionId,
          callerAnonymousId: callResult.callerAnonymousId,
          calleeAnonymousId: callResult.calleeAnonymousId
        };
      } else {
        return {
          success: false,
          error: this.mapCallErrorToProcessingError(callResult.error)
        };
      }

    } catch (error) {
      console.error('Token processing failed:', this.sanitizeError(error));
      return {
        success: false,
        error: TokenProcessingError.PROCESSING_FAILED
      };
    }
  }

  /**
   * Batch process multiple tokens (for system operations)
   * 
   * @param requests - Array of token processing requests
   * @returns Promise resolving to array of results
   */
  async batchProcessTokens(requests: TokenProcessingRequest[]): Promise<TokenProcessingResult[]> {
    const results: TokenProcessingResult[] = [];

    for (const request of requests) {
      try {
        const result = await this.processToken(request);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: TokenProcessingError.PROCESSING_FAILED
        });
      }
    }

    return results;
  }

  /**
   * Get rate limit status for a client
   * 
   * @param clientId - Client identifier
   * @param ipAddress - IP address
   * @returns Rate limit information
   */
  getRateLimitStatus(clientId?: string, ipAddress?: string): RateLimitInfo | null {
    if (!this.config.enableRateLimiting) {
      return null;
    }

    const identifier = clientId || ipAddress;
    if (!identifier) {
      return null;
    }

    const limits = this.clientLimits.get(identifier) || this.ipLimits.get(identifier);
    if (!limits) {
      return {
        remaining: this.config.rateLimitConfig.maxTokensPerMinute,
        resetTime: new Date(Date.now() + this.config.rateLimitConfig.windowSizeMinutes * 60 * 1000),
        windowMinutes: this.config.rateLimitConfig.windowSizeMinutes
      };
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - this.config.rateLimitConfig.windowSizeMinutes * 60 * 1000);
    const recentRequests = limits.requests.filter(req => req > windowStart);
    
    return {
      remaining: Math.max(0, this.config.rateLimitConfig.maxTokensPerMinute - recentRequests.length),
      resetTime: new Date(now.getTime() + this.config.rateLimitConfig.windowSizeMinutes * 60 * 1000),
      windowMinutes: this.config.rateLimitConfig.windowSizeMinutes
    };
  }

  /**
   * Clear rate limits for a client (admin function)
   * 
   * @param clientId - Client identifier
   * @param ipAddress - IP address
   */
  clearRateLimits(clientId?: string, ipAddress?: string): void {
    if (clientId) {
      this.clientLimits.delete(clientId);
    }
    if (ipAddress) {
      this.ipLimits.delete(ipAddress);
    }
  }

  /**
   * Get processing statistics
   * 
   * @returns Processing statistics
   */
  getProcessingStats(): {
    trackedClients: number;
    trackedIPs: number;
    blockedClients: number;
    blockedIPs: number;
  } {
    const now = new Date();
    let blockedClients = 0;
    let blockedIPs = 0;

    for (const limits of this.clientLimits.values()) {
      if (limits.blockedUntil && limits.blockedUntil > now) {
        blockedClients++;
      }
    }

    for (const limits of this.ipLimits.values()) {
      if (limits.blockedUntil && limits.blockedUntil > now) {
        blockedIPs++;
      }
    }

    return {
      trackedClients: this.clientLimits.size,
      trackedIPs: this.ipLimits.size,
      blockedClients,
      blockedIPs
    };
  }

  /**
   * Shutdown token processor and cleanup resources
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    this.clientLimits.clear();
    this.ipLimits.clear();
  }

  /**
   * Check rate limits for client/IP
   * 
   * @param clientId - Client identifier
   * @param ipAddress - IP address
   * @returns Rate limit check result
   */
  private checkRateLimit(clientId?: string, ipAddress?: string): {
    allowed: boolean;
    info?: RateLimitInfo;
  } {
    const identifier = clientId || ipAddress;
    if (!identifier) {
      return { allowed: true };
    }

    const limits = this.getOrCreateLimits(identifier, clientId ? 'client' : 'ip');
    const now = new Date();

    // Check if blocked
    if (limits.blockedUntil && limits.blockedUntil > now) {
      return {
        allowed: false,
        info: {
          remaining: 0,
          resetTime: limits.blockedUntil,
          windowMinutes: this.config.rateLimitConfig.blockDurationMinutes
        }
      };
    }

    // Check rate limits
    const windowStart = new Date(now.getTime() - this.config.rateLimitConfig.windowSizeMinutes * 60 * 1000);
    const recentRequests = limits.requests.filter(req => req > windowStart);

    const allowed = recentRequests.length < this.config.rateLimitConfig.maxTokensPerMinute;

    return {
      allowed,
      info: {
        remaining: Math.max(0, this.config.rateLimitConfig.maxTokensPerMinute - recentRequests.length),
        resetTime: new Date(now.getTime() + this.config.rateLimitConfig.windowSizeMinutes * 60 * 1000),
        windowMinutes: this.config.rateLimitConfig.windowSizeMinutes
      }
    };
  }

  /**
   * Check for abuse patterns
   * 
   * @param clientId - Client identifier
   * @param ipAddress - IP address
   * @returns Abuse detection result
   */
  private checkAbusePattern(clientId?: string, ipAddress?: string): { detected: boolean } {
    const identifier = clientId || ipAddress;
    if (!identifier) {
      return { detected: false };
    }

    const limits = this.getOrCreateLimits(identifier, clientId ? 'client' : 'ip');
    const now = new Date();

    // Check if already blocked for abuse
    if (limits.blockedUntil && limits.blockedUntil > now) {
      return { detected: true };
    }

    // Check for rapid requests (abuse pattern)
    const shortWindow = new Date(now.getTime() - 60 * 1000); // 1 minute window
    const rapidRequests = limits.requests.filter(req => req > shortWindow);

    if (rapidRequests.length >= this.config.rateLimitConfig.abuseThreshold) {
      // Block the client
      const blockUntil = new Date(now.getTime() + this.config.rateLimitConfig.blockDurationMinutes * 60 * 1000);
      
      const updatedLimits: ClientRateLimit = {
        ...limits,
        blockedUntil: blockUntil,
        abuseCount: limits.abuseCount + 1
      };

      if (clientId) {
        this.clientLimits.set(identifier, updatedLimits);
      } else {
        this.ipLimits.set(identifier, updatedLimits);
      }

      return { detected: true };
    }

    return { detected: false };
  }

  /**
   * Update rate limiting counters
   * 
   * @param clientId - Client identifier
   * @param ipAddress - IP address
   */
  private updateRateLimitCounters(clientId?: string, ipAddress?: string): void {
    const now = new Date();

    if (clientId) {
      const limits = this.getOrCreateLimits(clientId, 'client');
      limits.requests.push(now);
      this.clientLimits.set(clientId, limits);
    }

    if (ipAddress) {
      const limits = this.getOrCreateLimits(ipAddress, 'ip');
      limits.requests.push(now);
      this.ipLimits.set(ipAddress, limits);
    }
  }

  /**
   * Get or create rate limit tracking for identifier
   * 
   * @param identifier - Client or IP identifier
   * @param type - Type of identifier
   * @returns Client rate limit object
   */
  private getOrCreateLimits(identifier: string, type: 'client' | 'ip'): ClientRateLimit {
    const limitsMap = type === 'client' ? this.clientLimits : this.ipLimits;
    
    let limits = limitsMap.get(identifier);
    if (!limits) {
      limits = {
        clientId: identifier,
        requests: [],
        abuseCount: 0
      };
      limitsMap.set(identifier, limits);
    }

    return limits;
  }

  /**
   * Map call router error to processing error
   * 
   * @param callError - Call router error
   * @returns Corresponding processing error
   */
  private mapCallErrorToProcessingError(callError?: any): TokenProcessingError {
    switch (callError) {
      case 'TOKEN_RESOLUTION_FAILED':
        return TokenProcessingError.TOKEN_INVALID;
      case 'PRIVACY_VIOLATION':
        return TokenProcessingError.PRIVACY_VIOLATION;
      default:
        return TokenProcessingError.PROCESSING_FAILED;
    }
  }

  /**
   * Start cleanup timer for expired rate limit entries
   */
  private startCleanupTimer(): void {
    const cleanupIntervalMs = 15 * 60 * 1000; // 15 minutes
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredLimits();
    }, cleanupIntervalMs);
  }

  /**
   * Clean up expired rate limit entries
   */
  private cleanupExpiredLimits(): void {
    const now = new Date();
    const expiredThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours

    // Clean up client limits
    for (const [clientId, limits] of this.clientLimits.entries()) {
      // Remove old requests
      limits.requests = limits.requests.filter(req => req > expiredThreshold);
      
      // Remove entry if no recent activity and not blocked
      if (limits.requests.length === 0 && (!limits.blockedUntil || limits.blockedUntil < now)) {
        this.clientLimits.delete(clientId);
      }
    }

    // Clean up IP limits
    for (const [ipAddress, limits] of this.ipLimits.entries()) {
      // Remove old requests
      limits.requests = limits.requests.filter(req => req > expiredThreshold);
      
      // Remove entry if no recent activity and not blocked
      if (limits.requests.length === 0 && (!limits.blockedUntil || limits.blockedUntil < now)) {
        this.ipLimits.delete(ipAddress);
      }
    }
  }

  /**
   * Log token processing (privacy-compliant)
   * 
   * @param success - Processing success status
   * @param clientId - Client identifier
   * @param ipAddress - IP address
   * @param userAgent - User agent
   */
  private logTokenProcessing(
    success: boolean,
    clientId?: string,
    ipAddress?: string,
    userAgent?: string
  ): void {
    const logData: any = {
      event: 'TOKEN_PROCESSED',
      success,
      timestamp: new Date().toISOString()
    };

    // Only log anonymized/hashed identifiers
    if (clientId) {
      logData.clientHash = this.hashIdentifier(clientId);
    }

    if (ipAddress) {
      logData.ipHash = this.hashIdentifier(ipAddress);
    }

    if (userAgent) {
      logData.userAgentHash = this.hashIdentifier(userAgent);
    }

    console.log('Token processing event:', logData);
  }

  /**
   * Hash identifier for privacy-compliant logging
   * 
   * @param identifier - Identifier to hash
   * @returns Hashed identifier
   */
  private hashIdentifier(identifier: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(identifier).digest('hex').substring(0, 16);
  }

  /**
   * Sanitize error for logging
   * 
   * @param error - Error to sanitize
   * @returns Sanitized error
   */
  private sanitizeError(error: any): any {
    if (error instanceof Error) {
      return {
        message: error.message,
        type: error.constructor.name
      };
    }
    return 'Unknown error occurred';
  }
}

/**
 * Token processor factory for creating configured instances
 */
export class TokenProcessorFactory {
  static create(
    callRouter: CallRouter,
    privacyLayer: PrivacyLayer,
    config?: Partial<TokenProcessorConfig>
  ): TokenProcessor {
    return new TokenProcessor(callRouter, privacyLayer, config);
  }

  static createWithDefaults(
    callRouter: CallRouter,
    privacyLayer: PrivacyLayer
  ): TokenProcessor {
    return new TokenProcessor(callRouter, privacyLayer);
  }
}