/**
 * Call Routing Types for Privacy-Preserving QR-Based Calling System
 * 
 * Defines types for anonymous call routing, session management,
 * and privacy-preserving communication.
 */

import { UserId, AnonymousId } from '../security/types';
import { AnonymousSessionId } from '../utils/types';

/**
 * Call session status enumeration
 */
export enum CallStatus {
  INITIATING = 'initiating',
  RINGING = 'ringing',
  CONNECTED = 'connected',
  ENDED = 'ended',
  FAILED = 'failed'
}

/**
 * Anonymous call session record
 */
export interface CallSessionRecord {
  readonly sessionId: AnonymousSessionId;
  readonly participantA: AnonymousId;   // Never linked to real identity
  readonly participantB: AnonymousId;   // Never linked to real identity
  readonly status: CallStatus;
  readonly createdAt: Date;
  readonly endedAt?: Date;
  readonly encryptionKeyFingerprint: string;  // For audit purposes only
}

/**
 * Call session creation request
 */
export interface CallSessionRequest {
  readonly callerId: AnonymousId;
  readonly calleeId: AnonymousId;
}

/**
 * Call session participants
 */
export interface SessionParticipants {
  readonly participantA: AnonymousId;
  readonly participantB: AnonymousId;
}

/**
 * Token resolution result
 */
export interface TokenResolutionResult {
  readonly success: boolean;
  readonly userId?: UserId;
  readonly anonymousId?: AnonymousId;
  readonly error?: TokenResolutionError;
}

/**
 * Token resolution error types
 */
export enum TokenResolutionError {
  TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  RESOLUTION_FAILED = 'RESOLUTION_FAILED'
}

/**
 * Anonymous session creation result
 */
export interface SessionCreationResult {
  readonly success: boolean;
  readonly sessionId?: AnonymousSessionId;
  readonly error?: SessionCreationError;
}

/**
 * Session creation error types
 */
export enum SessionCreationError {
  DUPLICATE_SESSION = 'DUPLICATE_SESSION',
  INVALID_PARTICIPANTS = 'INVALID_PARTICIPANTS',
  STORAGE_ERROR = 'STORAGE_ERROR',
  CREATION_FAILED = 'CREATION_FAILED'
}

/**
 * Session lookup result
 */
export interface SessionLookupResult {
  readonly found: boolean;
  readonly session?: CallSessionRecord;
  readonly participants?: SessionParticipants;
}

/**
 * Privacy compliance validation result
 */
export interface PrivacyValidationResult {
  readonly compliant: boolean;
  readonly violations: string[];
  readonly sanitizedData?: any;
}