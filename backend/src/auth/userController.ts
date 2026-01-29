/**
 * User Profile Controller
 * 
 * HTTP request handlers for user profile management endpoints.
 */

import { Response } from 'express';
import { UserModel, UserProfileUpdateRequest } from './userModel';
import { AuthenticatedRequest } from './authMiddleware';

/**
 * User Profile Controller class
 */
export class UserController {
  private readonly userModel: UserModel;

  constructor(userModel: UserModel) {
    this.userModel = userModel;
  }

  /**
   * Get user profile endpoint
   */
  getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const profile = await this.userModel.getUserProfile(req.user.userId);
      if (!profile) {
        res.status(404).json({
          error: 'User profile not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Return profile without sensitive authentication data
      res.status(200).json({
        profile: {
          userId: profile.userId,
          email: profile.email,
          createdAt: profile.createdAt,
          lastLogin: profile.lastLogin,
          isActive: profile.isActive,
          emergencyContact: profile.emergencyContact,
          vehicleNumber: profile.vehicleNumber,
          mfaEnabled: profile.mfaEnabled
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get profile error:', error);
      
      res.status(500).json({
        error: 'Failed to retrieve profile',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Update user profile endpoint
   */
  updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const updateRequest: UserProfileUpdateRequest = {
        emergencyContact: req.body.emergencyContact,
        vehicleNumber: req.body.vehicleNumber
      };

      // Validate that at least one field is provided
      if (updateRequest.emergencyContact === undefined && updateRequest.vehicleNumber === undefined) {
        res.status(400).json({
          error: 'At least one field must be provided for update',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const updatedProfile = await this.userModel.updateUserProfile(req.user.userId, updateRequest);

      res.status(200).json({
        message: 'Profile updated successfully',
        profile: {
          userId: updatedProfile.userId,
          email: updatedProfile.email,
          createdAt: updatedProfile.createdAt,
          lastLogin: updatedProfile.lastLogin,
          isActive: updatedProfile.isActive,
          emergencyContact: updatedProfile.emergencyContact,
          vehicleNumber: updatedProfile.vehicleNumber,
          mfaEnabled: updatedProfile.mfaEnabled
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Update profile error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Profile update failed';
      const statusCode = this.getErrorStatusCode(errorMessage);

      res.status(statusCode).json({
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Delete user profile endpoint (privacy compliance)
   */
  deleteProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // For privacy compliance, we should anonymize rather than delete
      // This preserves system integrity while removing personal data
      
      res.status(501).json({
        error: 'Profile deletion not yet implemented',
        message: 'Contact support for account deletion requests',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Delete profile error:', error);
      
      res.status(500).json({
        error: 'Profile deletion failed',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get profile privacy settings endpoint
   */
  getPrivacySettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Return privacy-related settings
      res.status(200).json({
        privacySettings: {
          dataRetentionPeriod: '365 days',
          encryptionEnabled: true,
          anonymousCallsOnly: true,
          personalDataMinimized: true
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get privacy settings error:', error);
      
      res.status(500).json({
        error: 'Failed to retrieve privacy settings',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Maps errors to HTTP status codes
   */
  private getErrorStatusCode(errorMessage: string): number {
    if (errorMessage.includes('validation failed')) {
      return 400; // Bad Request
    }
    if (errorMessage.includes('not found')) {
      return 404; // Not Found
    }
    if (errorMessage.includes('unauthorized')) {
      return 401; // Unauthorized
    }
    return 500; // Internal Server Error
  }
}