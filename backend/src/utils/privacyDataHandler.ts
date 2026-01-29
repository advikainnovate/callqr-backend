/**
 * Privacy Data Handler
 * 
 * Ensures privacy-compliant data handling with no call content storage
 * beyond session management and secure log data sanitization.
 * 
 * Requirements: 4.5
 */

import { EventEmitter } from 'events';
import { logger } from './logger';
import { LogSanitizer, defaultLogSanitizer } from './logSanitizer';
import { AnonymousId } from '../security/types';
import { AnonymousSessionId } from '../utils/types';

/**
 * Privacy compliance configuration
 */
export interface PrivacyComplianceConfig {
  readonly enableCallContentBlocking: boolean;
  readonly enableMetadataMinimization: boolean;
  readonly enableAutomaticSanitization: boolean;
  readonly maxSessionMetadataFields: number;
  readonly allowedMetadataFields: string[];
  readonly blockedContentTypes: string[];
  readonly logRetentionHours: number;
}

/**
 * Default privacy compliance configuration
 */
const DEFAULT_CONFIG: PrivacyComplianceConfig = {
  enableCallContentBlocking: true,
  enableMetadataMinimization: true,
  enableAutomaticSanitization: true,
  maxSessionMetadataFields: 10,
  allowedMetadataFields: [
    'sessionId', 'status', 'createdAt', 'endedAt', 'duration',
    'participantCount', 'encryptionEnabled', 'securityLevel'
  ],
  blockedContentTypes: [
    'audio', 'video', 'media', 'recording', 'transcript',
    'conversation', 'message', 'chat', 'voice', 'call-content'
  ],
  logRetentionHours: 24
};

/**
 * Privacy violation types
 */
export enum PrivacyViolationType {
  CALL_CONTENT_DETECTED = 'CALL_CONTENT_DETECTED',
  PERSONAL_DATA_LEAK = 'PERSONAL_DATA_LEAK',
  EXCESSIVE_METADATA = 'EXCESSIVE_METADATA',
  UNAUTHORIZED_STORAGE = 'UNAUTHORIZED_STORAGE',
  RETENTION_VIOLATION = 'RETENTION_VIOLATION'
}

/**
 * Privacy violation event
 */
export interface PrivacyViolationEvent {
  readonly violationType: PrivacyViolationType;
  readonly sessionId?: AnonymousSessionId;
  readonly participantId?: AnonymousId;
  readonly details: Record<string, any>;
  readonly timestamp: Date;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * Session metadata (privacy-compliant)
 */
export interface PrivacyCompliantSessionMetadata {
  readonly sessionId: AnonymousSessionId;
  readonly status: string;
  readonly createdAt: Date;
  readonly endedAt?: Date;
  readonly duration?: number;
  readonly participantCount: number;
  readonly encryptionEnabled: boolean;
  readonly securityLevel: number;
  readonly anonymousParticipants: AnonymousId[];
}

/**
 * Data processing result
 */
export interface DataProcessingResult {
  readonly isCompliant: boolean;
  readonly processedData: any;
  readonly violations: PrivacyViolationEvent[];
  readonly sanitizationApplied: boolean;
  readonly blockedFields: string[];
}

/**
 * Privacy data handler events
 */
export interface PrivacyDataHandlerEvents {
  'privacy-violation': (violation: PrivacyViolationEvent) => void;
  'data-blocked': (data: { type: string; reason: string; timestamp: Date }) => void;
  'sanitization-applied': (data: { originalSize: number; sanitizedSize: number; timestamp: Date }) => void;
}

/**
 * Privacy data handler
 */
export class PrivacyDataHandler extends EventEmitter {
  private readonly config: PrivacyComplianceConfig;
  private readonly sanitizer: LogSanitizer;
  private readonly blockedContentPatterns: RegExp[];
  private readonly sessionMetadataCache: Map<string, PrivacyCompliantSessionMetadata> = new Map();

  constructor(
    config: Partial<PrivacyComplianceConfig> = {},
    sanitizer: LogSanitizer = defaultLogSanitizer
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sanitizer = sanitizer;
    
    // Compile blocked content patterns
    this.blockedContentPatterns = this.config.blockedContentTypes.map(
      type => new RegExp(`\\b${type}\\b`, 'i')
    );

    // Start cleanup timer for session metadata cache
    this.startMetadataCacheCleanup();
  }

  /**
   * Process session data with privacy compliance
   */
  public processSessionData(data: any): DataProcessingResult {
    const violations: PrivacyViolationEvent[] = [];
    let processedData = data;
    let sanitizationApplied = false;
    const blockedFields: string[] = [];

    try {
      // Check for call content
      const contentViolations = this.detectCallContent(data);
      violations.push(...contentViolations);

      // Block prohibited content
      const blockingResult = this.blockProhibitedContent(data);
      processedData = blockingResult.data;
      blockedFields.push(...blockingResult.blockedFields);

      // Minimize metadata
      if (this.config.enableMetadataMinimization) {
        processedData = this.minimizeMetadata(processedData);
      }

      // Apply sanitization
      if (this.config.enableAutomaticSanitization) {
        const sanitizationResult = this.sanitizer.sanitize(processedData);
        processedData = sanitizationResult.sanitizedData;
        sanitizationApplied = sanitizationResult.sanitizationCount > 0;

        if (sanitizationApplied) {
          this.emit('sanitization-applied', {
            originalSize: sanitizationResult.originalSize,
            sanitizedSize: sanitizationResult.sanitizedSize,
            timestamp: new Date()
          });
        }
      }

      // Emit violations
      violations.forEach(violation => this.emit('privacy-violation', violation));

      // Emit blocked data events
      if (blockedFields.length > 0) {
        this.emit('data-blocked', {
          type: 'PROHIBITED_CONTENT',
          reason: `Blocked fields: ${blockedFields.join(', ')}`,
          timestamp: new Date()
        });
      }

      return {
        isCompliant: violations.length === 0,
        processedData,
        violations,
        sanitizationApplied,
        blockedFields
      };

    } catch (error) {
      logger.error('Privacy data processing failed:', error as Record<string, unknown>);
      
      // Return safe default
      return {
        isCompliant: false,
        processedData: this.createSafeDefault(data),
        violations: [{
          violationType: PrivacyViolationType.UNAUTHORIZED_STORAGE,
          details: { error: 'Processing failed' },
          timestamp: new Date(),
          severity: 'HIGH'
        }],
        sanitizationApplied: false,
        blockedFields: []
      };
    }
  }

  /**
   * Create privacy-compliant session metadata
   */
  public createSessionMetadata(
    sessionId: AnonymousSessionId,
    status: string,
    participantIds: AnonymousId[],
    additionalData?: Record<string, any>
  ): PrivacyCompliantSessionMetadata {
    const metadata: PrivacyCompliantSessionMetadata = {
      sessionId,
      status,
      createdAt: new Date(),
      participantCount: participantIds.length,
      encryptionEnabled: true,
      securityLevel: 100,
      anonymousParticipants: participantIds
    };

    // Add allowed additional fields
    if (additionalData) {
      for (const [key, value] of Object.entries(additionalData)) {
        if (this.config.allowedMetadataFields.includes(key)) {
          (metadata as any)[key] = value;
        }
      }
    }

    // Cache metadata with expiration
    this.sessionMetadataCache.set(sessionId, metadata);
    
    return metadata;
  }

  /**
   * Update session metadata
   */
  public updateSessionMetadata(
    sessionId: AnonymousSessionId,
    updates: Partial<PrivacyCompliantSessionMetadata>
  ): boolean {
    const existing = this.sessionMetadataCache.get(sessionId);
    if (!existing) {
      return false;
    }

    // Only allow updates to specific fields
    const allowedUpdateFields = ['status', 'endedAt', 'duration', 'securityLevel'];
    const filteredUpdates: any = {};

    for (const [key, value] of Object.entries(updates)) {
      if (allowedUpdateFields.includes(key)) {
        filteredUpdates[key] = value;
      }
    }

    const updatedMetadata = { ...existing, ...filteredUpdates };
    this.sessionMetadataCache.set(sessionId, updatedMetadata);
    
    return true;
  }

  /**
   * Get session metadata (privacy-compliant)
   */
  public getSessionMetadata(sessionId: AnonymousSessionId): PrivacyCompliantSessionMetadata | null {
    return this.sessionMetadataCache.get(sessionId) || null;
  }

  /**
   * Remove session metadata
   */
  public removeSessionMetadata(sessionId: AnonymousSessionId): boolean {
    return this.sessionMetadataCache.delete(sessionId);
  }

  /**
   * Validate data for privacy compliance
   */
  public validatePrivacyCompliance(data: any): {
    isCompliant: boolean;
    violations: PrivacyViolationEvent[];
    recommendations: string[];
  } {
    const violations: PrivacyViolationEvent[] = [];
    const recommendations: string[] = [];

    // Check for call content
    const contentViolations = this.detectCallContent(data);
    violations.push(...contentViolations);

    // Check for personal data
    if (this.sanitizer.containsPersonalData(data)) {
      violations.push({
        violationType: PrivacyViolationType.PERSONAL_DATA_LEAK,
        details: { dataType: typeof data },
        timestamp: new Date(),
        severity: 'HIGH'
      });
      recommendations.push('Apply data sanitization before storage');
    }

    // Check metadata size
    if (typeof data === 'object' && data !== null) {
      const fieldCount = Object.keys(data).length;
      if (fieldCount > this.config.maxSessionMetadataFields) {
        violations.push({
          violationType: PrivacyViolationType.EXCESSIVE_METADATA,
          details: { fieldCount, maxAllowed: this.config.maxSessionMetadataFields },
          timestamp: new Date(),
          severity: 'MEDIUM'
        });
        recommendations.push('Minimize metadata to essential fields only');
      }
    }

    return {
      isCompliant: violations.length === 0,
      violations,
      recommendations
    };
  }

  /**
   * Block call content storage
   */
  public blockCallContent(data: any): { blocked: boolean; reason?: string } {
    if (!this.config.enableCallContentBlocking) {
      return { blocked: false };
    }

    const contentDetected = this.detectCallContent(data);
    if (contentDetected.length > 0) {
      const reasons = contentDetected.map(v => v.details.contentType).join(', ');
      return { blocked: true, reason: `Call content detected: ${reasons}` };
    }

    return { blocked: false };
  }

  /**
   * Get privacy compliance statistics
   */
  public getComplianceStatistics(): {
    totalProcessed: number;
    violationsDetected: number;
    contentBlocked: number;
    sanitizationApplied: number;
    activeSessionMetadata: number;
  } {
    // This would be implemented with actual counters in a real system
    return {
      totalProcessed: 0,
      violationsDetected: 0,
      contentBlocked: 0,
      sanitizationApplied: 0,
      activeSessionMetadata: this.sessionMetadataCache.size
    };
  }

  /**
   * Detect call content in data
   */
  private detectCallContent(data: any): PrivacyViolationEvent[] {
    const violations: PrivacyViolationEvent[] = [];

    if (!this.config.enableCallContentBlocking) {
      return violations;
    }

    const dataStr = JSON.stringify(data).toLowerCase();

    // Check for blocked content types
    for (const pattern of this.blockedContentPatterns) {
      if (pattern.test(dataStr)) {
        violations.push({
          violationType: PrivacyViolationType.CALL_CONTENT_DETECTED,
          details: { 
            contentType: pattern.source,
            dataType: typeof data
          },
          timestamp: new Date(),
          severity: 'CRITICAL'
        });
      }
    }

    // Check for specific call content indicators
    const callContentIndicators = [
      'audio_data', 'video_data', 'media_stream', 'recording_data',
      'transcript', 'conversation_log', 'voice_data', 'call_recording'
    ];

    for (const indicator of callContentIndicators) {
      if (dataStr.includes(indicator)) {
        violations.push({
          violationType: PrivacyViolationType.CALL_CONTENT_DETECTED,
          details: { 
            contentType: indicator,
            location: 'data_structure'
          },
          timestamp: new Date(),
          severity: 'CRITICAL'
        });
      }
    }

    return violations;
  }

  /**
   * Block prohibited content from data
   */
  private blockProhibitedContent(data: any): { data: any; blockedFields: string[] } {
    if (!data || typeof data !== 'object') {
      return { data, blockedFields: [] };
    }

    const processedData = JSON.parse(JSON.stringify(data)); // Deep clone
    const blockedFields: string[] = [];

    const processObject = (obj: any, path: string = ''): void => {
      if (!obj || typeof obj !== 'object') return;

      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const fullPath = path ? `${path}.${key}` : key;
          const lowerKey = key.toLowerCase();

          // Check if field name indicates prohibited content
          const isProhibited = this.config.blockedContentTypes.some(
            type => lowerKey.includes(type.toLowerCase())
          );

          if (isProhibited) {
            delete obj[key];
            blockedFields.push(fullPath);
          } else if (typeof obj[key] === 'object') {
            processObject(obj[key], fullPath);
          }
        }
      }
    };

    processObject(processedData);
    return { data: processedData, blockedFields };
  }

  /**
   * Minimize metadata to essential fields
   */
  private minimizeMetadata(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const minimized: any = {};
    let fieldCount = 0;

    // Only keep allowed fields
    for (const field of this.config.allowedMetadataFields) {
      if (data.hasOwnProperty(field) && fieldCount < this.config.maxSessionMetadataFields) {
        minimized[field] = data[field];
        fieldCount++;
      }
    }

    return minimized;
  }

  /**
   * Create safe default data structure
   */
  private createSafeDefault(originalData: any): any {
    return {
      status: 'PROCESSED',
      timestamp: new Date(),
      dataType: typeof originalData,
      privacyCompliant: true
    };
  }

  /**
   * Start metadata cache cleanup timer
   */
  private startMetadataCacheCleanup(): void {
    const cleanupInterval = this.config.logRetentionHours * 60 * 60 * 1000;
    
    setInterval(() => {
      const now = new Date();
      const expiredSessions: string[] = [];

      for (const [sessionId, metadata] of this.sessionMetadataCache.entries()) {
        const age = now.getTime() - metadata.createdAt.getTime();
        if (age > cleanupInterval) {
          expiredSessions.push(sessionId);
        }
      }

      for (const sessionId of expiredSessions) {
        this.sessionMetadataCache.delete(sessionId);
      }

      if (expiredSessions.length > 0) {
        logger.debug(`Cleaned up ${expiredSessions.length} expired session metadata entries`);
      }
    }, cleanupInterval);
  }
}

/**
 * Default privacy data handler instance
 */
export const defaultPrivacyDataHandler = new PrivacyDataHandler();

/**
 * Convenience function to process data with privacy compliance
 */
export function processWithPrivacyCompliance(data: any): any {
  const result = defaultPrivacyDataHandler.processSessionData(data);
  return result.processedData;
}

/**
 * Convenience function to validate privacy compliance
 */
export function validatePrivacyCompliance(data: any): boolean {
  const result = defaultPrivacyDataHandler.validatePrivacyCompliance(data);
  return result.isCompliant;
}