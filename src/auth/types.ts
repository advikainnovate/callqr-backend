/**
 * Authentication Types for Privacy-Preserving QR-Based Calling System
 * 
 * Defines authentication-related types including user credentials,
 * multi-factor authentication, and session management.
 */

import { UserId } from '../utils/types';

/**
 * User registration request
 */
export interface UserRegistrationRequest {
  readonly email: string;
  readonly password: string;
  readonly emergencyContact?: string;
  readonly vehicleNumber?: string;
}

/**
 * User login request
 */
export interface UserLoginRequest {
  readonly email: string;
  readonly password: string;
  readonly mfaCode?: string;
}

/**
 * User credentials for internal use
 */
export interface UserCredentials {
  readonly userId: UserId;
  readonly email: string;
  readonly passwordHash: string;
  readonly salt: string;
  readonly mfaSecret?: string;
  readonly mfaEnabled: boolean;
  readonly createdAt: Date;
  readonly lastLogin?: Date;
  readonly failedLoginAttempts: number;
  readonly lockedUntil?: Date;
}

/**
 * Authentication result
 */
export interface AuthenticationResult {
  readonly success: boolean;
  readonly userId?: UserId;
  readonly requiresMFA?: boolean;
  readonly error?: AuthenticationError;
  readonly lockoutTime?: Date;
}

/**
 * Authentication error types
 */
export enum AuthenticationError {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  MFA_REQUIRED = 'MFA_REQUIRED',
  INVALID_MFA_CODE = 'INVALID_MFA_CODE',
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  RATE_LIMITED = 'RATE_LIMITED'
}

/**
 * Session information
 */
export interface UserSession {
  readonly sessionId: string;
  readonly userId: UserId;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly isActive: boolean;
}

/**
 * JWT payload structure
 */
export interface JWTPayload {
  readonly userId: UserId;
  readonly sessionId: string;
  readonly iat: number;
  readonly exp: number;
  readonly iss: string;
}

/**
 * MFA setup request
 */
export interface MFASetupRequest {
  readonly userId: UserId;
}

/**
 * MFA setup response
 */
export interface MFASetupResponse {
  readonly secret: string;
  readonly qrCodeUrl: string;
  readonly backupCodes: string[];
}

/**
 * MFA verification request
 */
export interface MFAVerificationRequest {
  readonly userId: UserId;
  readonly code: string;
}

/**
 * Password validation requirements
 */
export interface PasswordRequirements {
  readonly minLength: number;
  readonly requireUppercase: boolean;
  readonly requireLowercase: boolean;
  readonly requireNumbers: boolean;
  readonly requireSpecialChars: boolean;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  readonly maxAttempts: number;
  readonly windowMinutes: number;
  readonly lockoutMinutes: number;
}