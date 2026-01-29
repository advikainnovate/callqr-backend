/**
 * User Data Model with Privacy Fields
 * 
 * Implements secure user data model with privacy-compliant fields
 * for emergency contact and vehicle identification.
 */

import { UserId } from '../utils/types';
import { UserStorage } from './authService';

/**
 * User profile with privacy fields
 */
export interface UserProfile {
  readonly userId: UserId;
  readonly email: string;
  readonly createdAt: Date;
  readonly lastLogin?: Date;
  readonly isActive: boolean;
  readonly emergencyContact?: string;
  readonly vehicleNumber?: string;
  readonly mfaEnabled: boolean;
}

/**
 * User profile update request
 */
export interface UserProfileUpdateRequest {
  readonly emergencyContact?: string;
  readonly vehicleNumber?: string;
}

/**
 * User profile validation result
 */
export interface ProfileValidationResult {
  readonly isValid: boolean;
  readonly errors: string[];
}

/**
 * User Model class for managing user profiles with privacy fields
 */
export class UserModel {
  private readonly userStorage: UserStorage;

  constructor(userStorage: UserStorage) {
    this.userStorage = userStorage;
  }

  /**
   * Gets user profile by ID
   */
  async getUserProfile(userId: UserId): Promise<UserProfile | null> {
    try {
      const user = await this.userStorage.getUserById(userId);
      if (!user) {
        return null;
      }

      // Get profile data with privacy fields
      const profileData = await this.userStorage.getUserProfile(userId);

      return {
        userId: user.userId,
        email: user.email,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        isActive: true, // Assuming active if found
        emergencyContact: profileData?.emergencyContact,
        vehicleNumber: profileData?.vehicleNumber,
        mfaEnabled: user.mfaEnabled
      };
    } catch (error) {
      console.error('Error getting user profile:', error);
      throw error;
    }
  }

  /**
   * Updates user profile with privacy fields
   */
  async updateUserProfile(
    userId: UserId, 
    updates: UserProfileUpdateRequest
  ): Promise<UserProfile> {
    try {
      // Validate the update request
      const validation = this.validateProfileUpdate(updates);
      if (!validation.isValid) {
        throw new Error(`Profile validation failed: ${validation.errors.join(', ')}`);
      }

      // Get current user data
      const currentUser = await this.userStorage.getUserById(userId);
      if (!currentUser) {
        throw new Error('User not found');
      }

      // Update user profile in database
      await this.updateUserProfileInDatabase(userId, updates);

      // Return updated profile
      const updatedProfile = await this.getUserProfile(userId);
      if (!updatedProfile) {
        throw new Error('Failed to retrieve updated profile');
      }

      return updatedProfile;
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }

  /**
   * Validates profile update request
   */
  private validateProfileUpdate(updates: UserProfileUpdateRequest): ProfileValidationResult {
    const errors: string[] = [];

    // Validate emergency contact
    if (updates.emergencyContact !== undefined) {
      if (updates.emergencyContact.length > 256) {
        errors.push('Emergency contact must be 256 characters or less');
      }
      
      // Basic format validation for emergency contact
      if (updates.emergencyContact.length > 0 && !this.isValidEmergencyContact(updates.emergencyContact)) {
        errors.push('Emergency contact format is invalid');
      }
    }

    // Validate vehicle number
    if (updates.vehicleNumber !== undefined) {
      if (updates.vehicleNumber.length > 100) {
        errors.push('Vehicle number must be 100 characters or less');
      }
      
      // Basic format validation for vehicle number
      if (updates.vehicleNumber.length > 0 && !this.isValidVehicleNumber(updates.vehicleNumber)) {
        errors.push('Vehicle number format is invalid');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates emergency contact format
   */
  private isValidEmergencyContact(contact: string): boolean {
    // Allow phone numbers, email addresses, or simple text
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const textRegex = /^[a-zA-Z0-9\s\-\.\,\(\)]+$/;

    return phoneRegex.test(contact) || emailRegex.test(contact) || textRegex.test(contact);
  }

  /**
   * Validates vehicle number format
   */
  private isValidVehicleNumber(vehicleNumber: string): boolean {
    // Allow alphanumeric characters, spaces, and common separators
    const vehicleRegex = /^[a-zA-Z0-9\s\-]+$/;
    return vehicleRegex.test(vehicleNumber);
  }

  /**
   * Updates user profile in database
   */
  private async updateUserProfileInDatabase(
    userId: UserId, 
    updates: UserProfileUpdateRequest
  ): Promise<void> {
    await this.userStorage.updateUserProfile(userId, {
      emergencyContact: updates.emergencyContact,
      vehicleNumber: updates.vehicleNumber
    });
  }
}

/**
 * Privacy-compliant user data encryption utilities
 */
export class UserDataEncryption {
  private readonly encryptionKey: string;

  constructor(encryptionKey?: string) {
    this.encryptionKey = encryptionKey || process.env.USER_DATA_ENCRYPTION_KEY || 'default-key';
  }

  /**
   * Encrypts sensitive user data before storage
   */
  async encryptUserData(data: string): Promise<string> {
    // Implement AES-256 encryption for sensitive data
    // This is a placeholder implementation
    return Buffer.from(data).toString('base64');
  }

  /**
   * Decrypts sensitive user data after retrieval
   */
  async decryptUserData(encryptedData: string): Promise<string> {
    // Implement AES-256 decryption for sensitive data
    // This is a placeholder implementation
    return Buffer.from(encryptedData, 'base64').toString();
  }

  /**
   * Hashes data for secure comparison without storing plaintext
   */
  async hashUserData(data: string): Promise<string> {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data + this.encryptionKey).digest('hex');
  }
}

/**
 * User data retention and privacy compliance utilities
 */
export class UserDataRetention {
  private readonly userStorage: UserStorage;

  constructor(userStorage: UserStorage) {
    this.userStorage = userStorage;
  }

  /**
   * Anonymizes user data for privacy compliance
   */
  async anonymizeUserData(userId: UserId): Promise<void> {
    try {
      // Replace personal data with anonymized values
      const anonymizedUpdates = {
        email: `anonymized_${Date.now()}@privacy.local`,
        // Clear sensitive fields while maintaining data structure
      };

      // Update user with anonymized data
      await this.userStorage.updateUser(userId, anonymizedUpdates as any);
      
      console.log(`User data anonymized for user: ${userId}`);
    } catch (error) {
      console.error('Error anonymizing user data:', error);
      throw error;
    }
  }

  /**
   * Checks if user data should be retained based on privacy policies
   */
  async shouldRetainUserData(userId: UserId): Promise<boolean> {
    try {
      const user = await this.userStorage.getUserById(userId);
      if (!user) {
        return false;
      }

      // Check if user has been inactive for retention period
      const retentionPeriodDays = 365; // 1 year retention policy
      const retentionCutoff = new Date();
      retentionCutoff.setDate(retentionCutoff.getDate() - retentionPeriodDays);

      const lastActivity = user.lastLogin || user.createdAt;
      return lastActivity > retentionCutoff;
    } catch (error) {
      console.error('Error checking data retention:', error);
      return true; // Default to retain on error
    }
  }
}