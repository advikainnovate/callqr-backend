/**
 * Mobile App Types for Privacy-Preserving QR-Based Calling System
 * 
 * Defines core types for the mobile application including secure tokens,
 * QR scanning results, and validation types.
 */

// Branded types for type safety (matching backend types)
export type UserId = string & { readonly __brand: unique symbol };
export type AnonymousId = string & { readonly __brand: unique symbol };
export type AnonymousSessionId = string & { readonly __brand: unique symbol };

/**
 * Secure token structure (matches backend)
 */
export interface SecureToken {
  readonly value: string;      // 256-bit cryptographically secure token
  readonly version: number;    // Token format version for future compatibility
  readonly checksum: string;   // Integrity verification checksum
  readonly createdAt: Date;    // Token creation timestamp
}

/**
 * QR scanning result
 */
export interface QRScanResult {
  readonly success: boolean;
  readonly token?: SecureToken;
  readonly error?: QRScanError;
  readonly rawData?: string;
}

/**
 * QR scanning error types
 */
export enum QRScanError {
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_CHECKSUM = 'INVALID_CHECKSUM',
  UNSUPPORTED_VERSION = 'UNSUPPORTED_VERSION',
  MALFORMED_DATA = 'MALFORMED_DATA',
  CAMERA_PERMISSION_DENIED = 'CAMERA_PERMISSION_DENIED',
  CAMERA_ERROR = 'CAMERA_ERROR',
  SCAN_TIMEOUT = 'SCAN_TIMEOUT'
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  readonly isValid: boolean;
  readonly error?: QRScanError;
  readonly token?: SecureToken;
}

/**
 * QR scanner configuration
 */
export interface QRScannerConfig {
  readonly timeoutMs: number;
  readonly showMarker: boolean;
  readonly markerStyle: {
    borderColor: string;
    borderWidth: number;
  };
  readonly cameraStyle: {
    height: number;
    width: number;
  };
}

/**
 * Camera permission status
 */
export enum CameraPermissionStatus {
  GRANTED = 'granted',
  DENIED = 'denied',
  BLOCKED = 'blocked',
  UNAVAILABLE = 'unavailable'
}

/**
 * QR scanner state
 */
export interface QRScannerState {
  readonly isScanning: boolean;
  readonly hasPermission: boolean;
  readonly permissionStatus: CameraPermissionStatus;
  readonly lastScanResult?: QRScanResult;
  readonly error?: string;
}

/**
 * Call-related types
 */
export enum CallStatus {
  INITIATING = 'initiating',
  RINGING = 'ringing',
  CONNECTED = 'connected',
  ENDED = 'ended',
  FAILED = 'failed',
}

export enum CallDirection {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing',
}

/**
 * Permission-related types
 */
export enum AppPermission {
  CAMERA = 'camera',
  MICROPHONE = 'microphone',
}

export enum PermissionState {
  GRANTED = 'granted',
  DENIED = 'denied',
  BLOCKED = 'blocked',
  UNAVAILABLE = 'unavailable',
  LIMITED = 'limited',
}