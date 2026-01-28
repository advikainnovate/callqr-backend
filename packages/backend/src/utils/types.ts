/**
 * Core type definitions for the Privacy-Preserving QR-Based Calling System
 * 
 * These types ensure type safety across the backend services and maintain
 * the privacy-first architecture by using branded types for sensitive data.
 */

// Branded types for enhanced type safety and privacy
export type UserId = string & { readonly __brand: unique symbol };
export type SecureToken = string & { readonly __brand: unique symbol };
export type AnonymousId = string & { readonly __brand: unique symbol };
export type AnonymousSessionId = string & { readonly __brand: unique symbol };

// Core interfaces
export interface UserAccount {
  readonly userId: UserId;
  readonly createdAt: Date;
  readonly lastTokenGeneration?: Date;
  readonly authenticationHash: string;
  readonly isActive: boolean;
  readonly emergencyContact?: string;
  readonly vehicleNumber?: string;
}

export interface TokenMapping {
  readonly hashedToken: string;
  readonly userId: UserId;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly isRevoked: boolean;
}

export interface CallSessionRecord {
  readonly sessionId: AnonymousSessionId;
  readonly participantA: AnonymousId;
  readonly participantB: AnonymousId;
  readonly status: CallStatus;
  readonly createdAt: Date;
  readonly endedAt?: Date;
  readonly encryptionKeyFingerprint: string;
}

// Enums
export enum CallStatus {
  INITIATING = 'initiating',
  RINGING = 'ringing',
  CONNECTED = 'connected',
  ENDED = 'ended',
  FAILED = 'failed'
}

// API Request/Response types
export interface GenerateTokenRequest {
  userId: UserId;
}

export interface GenerateTokenResponse {
  qrCodeData: string;
  tokenId: string;
  expiresAt: Date;
}

export interface ValidateTokenRequest {
  token: SecureToken;
}

export interface ValidateTokenResponse {
  valid: boolean;
  canInitiateCall: boolean;
}

export interface InitiateCallRequest {
  scannedToken: SecureToken;
  callerAnonymousId: AnonymousId;
}

export interface InitiateCallResponse {
  sessionId: AnonymousSessionId;
  signalingEndpoint: string;
  stunServers: STUNServerConfig[];
  turnServers: TURNServerConfig[];
}

// WebRTC Configuration types
export interface STUNServerConfig {
  urls: string;
}

export interface TURNServerConfig {
  urls: string;
  username: string;
  credential: string;
}

// Error types
export interface APIError {
  error: string;
  timestamp: string;
  code?: string;
}

// Utility type guards
export function isUserId(value: string): value is UserId {
  return typeof value === 'string' && value.length > 0;
}

export function isSecureToken(value: string): value is SecureToken {
  return typeof value === 'string' && value.length >= 32; // Minimum length for secure tokens
}

export function isAnonymousId(value: string): value is AnonymousId {
  return typeof value === 'string' && value.startsWith('anon_');
}

export function isAnonymousSessionId(value: string): value is AnonymousSessionId {
  return typeof value === 'string' && value.startsWith('session_');
}