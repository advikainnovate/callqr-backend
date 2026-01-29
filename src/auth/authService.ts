/**
 * Authentication Service
 * 
 * Main authentication service that handles user registration, login,
 * multi-factor authentication, and session management.
 */

import * as crypto from 'crypto';
import { 
  UserRegistrationRequest, 
  UserLoginRequest, 
  UserCredentials, 
  AuthenticationResult, 
  AuthenticationError,
  UserSession
} from './types';
import { UserId } from '../utils/types';
import { validatePassword } from './passwordValidator';
import { hashPassword, verifyPassword, PasswordHashResult } from './passwordHasher';
import { MFAManager } from './mfaManager';
import { SessionManager, SessionConfig, CreateSessionRequest } from './sessionManager';
import { RateLimiter } from './rateLimiter';

/**
 * Authentication service configuration
 */
export interface AuthServiceConfig {
  readonly sessionConfig: SessionConfig;
  readonly requireMFA: boolean;
  readonly passwordPepper?: string;
}

/**
 * User profile update data
 */
export interface UserProfileData {
  readonly emergencyContact?: string;
  readonly vehicleNumber?: string;
}

/**
 * User storage interface (to be implemented by database layer)
 */
export interface UserStorage {
  createUser(credentials: UserCredentials): Promise<void>;
  getUserByEmail(email: string): Promise<UserCredentials | null>;
  getUserById(userId: UserId): Promise<UserCredentials | null>;
  updateUser(userId: UserId, updates: Partial<UserCredentials>): Promise<void>;
  updateLoginAttempts(userId: UserId, attempts: number, lockedUntil?: Date): Promise<void>;
  updateUserProfile(userId: UserId, profileData: UserProfileData): Promise<void>;
  getUserProfile(userId: UserId): Promise<UserProfileData | null>;
}

/**
 * Authentication Service class
 */
export class AuthService {
  private readonly config: AuthServiceConfig;
  private readonly userStorage: UserStorage;
  private readonly mfaManager: MFAManager;
  private readonly sessionManager: SessionManager;
  private readonly rateLimiter: RateLimiter;

  constructor(
    config: AuthServiceConfig,
    userStorage: UserStorage
  ) {
    this.config = config;
    this.userStorage = userStorage;
    this.mfaManager = new MFAManager();
    this.sessionManager = new SessionManager(config.sessionConfig);
    this.rateLimiter = new RateLimiter();
  }

  /**
   * Registers a new user
   */
  async registerUser(
    request: UserRegistrationRequest,
    ipAddress: string
  ): Promise<{ userId: UserId; requiresMFA: boolean }> {
    // Check rate limiting
    const rateLimitResult = this.rateLimiter.checkLimit('registration', ipAddress);
    if (!rateLimitResult.allowed) {
      this.rateLimiter.recordAttempt('registration', ipAddress, false);
      throw new Error('Registration rate limit exceeded');
    }

    try {
      // Validate email format
      if (!this.isValidEmail(request.email)) {
        throw new Error('Invalid email format');
      }

      // Check if user already exists
      const existingUser = await this.userStorage.getUserByEmail(request.email);
      if (existingUser) {
        this.rateLimiter.recordAttempt('registration', ipAddress, false);
        throw new Error('Email already registered');
      }

      // Validate password
      const passwordValidation = validatePassword(request.password);
      if (!passwordValidation.isValid) {
        this.rateLimiter.recordAttempt('registration', ipAddress, false);
        throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
      }

      // Hash password
      const passwordHash = await hashPassword(request.password, {
        saltRounds: 12,
        pepper: this.config.passwordPepper
      });

      // Generate user ID
      const userId = this.generateUserId();

      // Create user credentials
      const credentials: UserCredentials = {
        userId,
        email: request.email.toLowerCase().trim(),
        passwordHash: passwordHash.hash,
        salt: passwordHash.salt,
        mfaEnabled: this.config.requireMFA,
        createdAt: new Date(),
        failedLoginAttempts: 0
      };

      // Store user
      await this.userStorage.createUser(credentials);

      // Record successful registration
      this.rateLimiter.recordAttempt('registration', ipAddress, true);

      return {
        userId,
        requiresMFA: this.config.requireMFA
      };

    } catch (error) {
      this.rateLimiter.recordAttempt('registration', ipAddress, false);
      throw error;
    }
  }

  /**
   * Authenticates a user login
   */
  async loginUser(
    request: UserLoginRequest,
    ipAddress: string,
    userAgent: string
  ): Promise<{ result: AuthenticationResult; session?: UserSession; token?: string }> {
    const email = request.email.toLowerCase().trim();

    // Check rate limiting
    const rateLimitResult = this.rateLimiter.checkLimit('login', email);
    if (!rateLimitResult.allowed) {
      this.rateLimiter.recordAttempt('login', email, false);
      return {
        result: {
          success: false,
          error: AuthenticationError.RATE_LIMITED,
          lockoutTime: rateLimitResult.lockoutTime
        }
      };
    }

    try {
      // Get user credentials
      const user = await this.userStorage.getUserByEmail(email);
      if (!user) {
        this.rateLimiter.recordAttempt('login', email, false);
        return {
          result: {
            success: false,
            error: AuthenticationError.INVALID_CREDENTIALS
          }
        };
      }

      // Check if account is locked
      if (user.lockedUntil && new Date() < user.lockedUntil) {
        return {
          result: {
            success: false,
            error: AuthenticationError.ACCOUNT_LOCKED,
            lockoutTime: user.lockedUntil
          }
        };
      }

      // Verify password
      const passwordHashResult: PasswordHashResult = {
        hash: user.passwordHash,
        salt: user.salt,
        algorithm: 'bcrypt',
        rounds: 12
      };

      const passwordValid = await verifyPassword(
        request.password,
        passwordHashResult,
        { saltRounds: 12, pepper: this.config.passwordPepper }
      );

      if (!passwordValid) {
        // Increment failed attempts
        const newFailedAttempts = user.failedLoginAttempts + 1;
        let lockedUntil: Date | undefined;

        // Lock account after 5 failed attempts
        if (newFailedAttempts >= 5) {
          lockedUntil = new Date(Date.now() + (30 * 60 * 1000)); // 30 minutes
        }

        await this.userStorage.updateLoginAttempts(user.userId, newFailedAttempts, lockedUntil);
        this.rateLimiter.recordAttempt('login', email, false);

        return {
          result: {
            success: false,
            error: lockedUntil ? AuthenticationError.ACCOUNT_LOCKED : AuthenticationError.INVALID_CREDENTIALS,
            lockoutTime: lockedUntil
          }
        };
      }

      // Check if MFA is required
      if (user.mfaEnabled && !request.mfaCode) {
        return {
          result: {
            success: false,
            requiresMFA: true,
            userId: user.userId
          }
        };
      }

      // Verify MFA if provided
      if (user.mfaEnabled && request.mfaCode) {
        if (!user.mfaSecret) {
          return {
            result: {
              success: false,
              error: AuthenticationError.INVALID_MFA_CODE
            }
          };
        }

        const mfaValid = this.mfaManager.verifyTOTP(user.mfaSecret, request.mfaCode);
        if (!mfaValid) {
          this.rateLimiter.recordAttempt('mfa', email, false);
          return {
            result: {
              success: false,
              error: AuthenticationError.INVALID_MFA_CODE
            }
          };
        }
      }

      // Reset failed login attempts
      if (user.failedLoginAttempts > 0) {
        await this.userStorage.updateLoginAttempts(user.userId, 0);
      }

      // Update last login
      await this.userStorage.updateUser(user.userId, {
        lastLogin: new Date()
      });

      // Create session
      const sessionRequest: CreateSessionRequest = {
        userId: user.userId,
        ipAddress,
        userAgent
      };

      const { session, token } = await this.sessionManager.createSession(sessionRequest);

      // Record successful login
      this.rateLimiter.recordAttempt('login', email, true);

      return {
        result: {
          success: true,
          userId: user.userId
        },
        session,
        token
      };

    } catch (error) {
      console.error('Login error:', error);
      this.rateLimiter.recordAttempt('login', email, false);
      
      return {
        result: {
          success: false,
          error: AuthenticationError.INVALID_CREDENTIALS
        }
      };
    }
  }

  /**
   * Sets up MFA for a user
   */
  async setupMFA(userId: UserId, userEmail: string) {
    const user = await this.userStorage.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const mfaSetup = this.mfaManager.setupMFA(userEmail);

    // Store MFA secret
    await this.userStorage.updateUser(userId, {
      mfaSecret: mfaSetup.secret,
      mfaEnabled: true
    });

    return mfaSetup;
  }

  /**
   * Validates a session token
   */
  async validateSession(token: string) {
    return await this.sessionManager.validateSession(token);
  }

  /**
   * Refreshes a session
   */
  async refreshSession(sessionId: string) {
    return await this.sessionManager.refreshSession(sessionId);
  }

  /**
   * Logs out a user (destroys session)
   */
  async logout(sessionId: string): Promise<boolean> {
    return await this.sessionManager.destroySession(sessionId);
  }

  /**
   * Logs out all sessions for a user
   */
  async logoutAllSessions(userId: UserId): Promise<number> {
    return await this.sessionManager.destroyAllUserSessions(userId);
  }

  /**
   * Generates a unique user ID
   */
  private generateUserId(): UserId {
    return crypto.randomUUID() as UserId;
  }

  /**
   * Validates email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }
}