/**
 * Permission Manager
 * 
 * Handles camera and microphone permission requests with graceful
 * user prompts and error handling.
 * 
 * Requirements: 9.5
 */

import { Platform, Alert, Linking } from 'react-native';
import { 
  check, 
  request, 
  openSettings,
  PERMISSIONS, 
  RESULTS,
  Permission,
  PermissionStatus 
} from 'react-native-permissions';

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

export interface PermissionResult {
  permission: AppPermission;
  state: PermissionState;
  canRequest: boolean;
  message?: string;
}

export interface PermissionRequestOptions {
  showRationale?: boolean;
  rationaleTitle?: string;
  rationaleMessage?: string;
  settingsTitle?: string;
  settingsMessage?: string;
}

/**
 * Permission Manager class
 */
export class PermissionManager {
  /**
   * Get platform-specific permission
   */
  private getPlatformPermission(permission: AppPermission): Permission {
    switch (permission) {
      case AppPermission.CAMERA:
        return Platform.OS === 'ios' 
          ? PERMISSIONS.IOS.CAMERA 
          : PERMISSIONS.ANDROID.CAMERA;
      case AppPermission.MICROPHONE:
        return Platform.OS === 'ios' 
          ? PERMISSIONS.IOS.MICROPHONE 
          : PERMISSIONS.ANDROID.RECORD_AUDIO;
      default:
        throw new Error(`Unknown permission: ${permission}`);
    }
  }

  /**
   * Convert permission status to our enum
   */
  private convertPermissionStatus(status: PermissionStatus): PermissionState {
    switch (status) {
      case RESULTS.GRANTED:
        return PermissionState.GRANTED;
      case RESULTS.DENIED:
        return PermissionState.DENIED;
      case RESULTS.BLOCKED:
        return PermissionState.BLOCKED;
      case RESULTS.UNAVAILABLE:
        return PermissionState.UNAVAILABLE;
      case RESULTS.LIMITED:
        return PermissionState.LIMITED;
      default:
        return PermissionState.UNAVAILABLE;
    }
  }

  /**
   * Check permission status
   */
  async checkPermission(permission: AppPermission): Promise<PermissionResult> {
    try {
      const platformPermission = this.getPlatformPermission(permission);
      const status = await check(platformPermission);
      const state = this.convertPermissionStatus(status);
      
      return {
        permission,
        state,
        canRequest: state === PermissionState.DENIED,
      };
    } catch (error) {
      console.error(`Error checking ${permission} permission:`, error);
      return {
        permission,
        state: PermissionState.UNAVAILABLE,
        canRequest: false,
        message: 'Failed to check permission status',
      };
    }
  }

  /**
   * Request permission with user-friendly prompts
   */
  async requestPermission(
    permission: AppPermission, 
    options: PermissionRequestOptions = {}
  ): Promise<PermissionResult> {
    try {
      // First check current status
      const currentStatus = await this.checkPermission(permission);
      
      // If already granted, return success
      if (currentStatus.state === PermissionState.GRANTED) {
        return currentStatus;
      }

      // If blocked, show settings prompt
      if (currentStatus.state === PermissionState.BLOCKED) {
        return this.handleBlockedPermission(permission, options);
      }

      // If unavailable, return error
      if (currentStatus.state === PermissionState.UNAVAILABLE) {
        return {
          permission,
          state: PermissionState.UNAVAILABLE,
          canRequest: false,
          message: 'This permission is not available on your device',
        };
      }

      // Show rationale if requested
      if (options.showRationale) {
        const shouldProceed = await this.showRationale(permission, options);
        if (!shouldProceed) {
          return {
            permission,
            state: PermissionState.DENIED,
            canRequest: true,
            message: 'Permission request cancelled by user',
          };
        }
      }

      // Request permission
      const platformPermission = this.getPlatformPermission(permission);
      const status = await request(platformPermission);
      const state = this.convertPermissionStatus(status);

      // Handle blocked after request
      if (state === PermissionState.BLOCKED) {
        return this.handleBlockedPermission(permission, options);
      }

      return {
        permission,
        state,
        canRequest: state === PermissionState.DENIED,
      };

    } catch (error) {
      console.error(`Error requesting ${permission} permission:`, error);
      return {
        permission,
        state: PermissionState.UNAVAILABLE,
        canRequest: false,
        message: 'Failed to request permission',
      };
    }
  }

  /**
   * Request multiple permissions
   */
  async requestMultiplePermissions(
    permissions: AppPermission[],
    options: PermissionRequestOptions = {}
  ): Promise<PermissionResult[]> {
    const results: PermissionResult[] = [];
    
    for (const permission of permissions) {
      const result = await this.requestPermission(permission, options);
      results.push(result);
      
      // If any critical permission is blocked, stop requesting others
      if (result.state === PermissionState.BLOCKED) {
        break;
      }
    }
    
    return results;
  }

  /**
   * Show rationale dialog
   */
  private showRationale(
    permission: AppPermission, 
    options: PermissionRequestOptions
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const title = options.rationaleTitle || this.getDefaultRationaleTitle(permission);
      const message = options.rationaleMessage || this.getDefaultRationaleMessage(permission);
      
      Alert.alert(
        title,
        message,
        [
          { 
            text: 'Not Now', 
            style: 'cancel', 
            onPress: () => resolve(false) 
          },
          { 
            text: 'Continue', 
            onPress: () => resolve(true) 
          },
        ]
      );
    });
  }

  /**
   * Handle blocked permission
   */
  private handleBlockedPermission(
    permission: AppPermission,
    options: PermissionRequestOptions
  ): Promise<PermissionResult> {
    return new Promise((resolve) => {
      const title = options.settingsTitle || this.getDefaultSettingsTitle(permission);
      const message = options.settingsMessage || this.getDefaultSettingsMessage(permission);
      
      Alert.alert(
        title,
        message,
        [
          { 
            text: 'Cancel', 
            style: 'cancel', 
            onPress: () => resolve({
              permission,
              state: PermissionState.BLOCKED,
              canRequest: false,
              message: 'Permission blocked by user',
            })
          },
          { 
            text: 'Open Settings', 
            onPress: async () => {
              try {
                await openSettings();
                // After returning from settings, check permission again
                const result = await this.checkPermission(permission);
                resolve(result);
              } catch (error) {
                resolve({
                  permission,
                  state: PermissionState.BLOCKED,
                  canRequest: false,
                  message: 'Failed to open settings',
                });
              }
            }
          },
        ]
      );
    });
  }

  /**
   * Get default rationale title
   */
  private getDefaultRationaleTitle(permission: AppPermission): string {
    switch (permission) {
      case AppPermission.CAMERA:
        return 'Camera Access Required';
      case AppPermission.MICROPHONE:
        return 'Microphone Access Required';
      default:
        return 'Permission Required';
    }
  }

  /**
   * Get default rationale message
   */
  private getDefaultRationaleMessage(permission: AppPermission): string {
    switch (permission) {
      case AppPermission.CAMERA:
        return 'This app needs camera access to scan QR codes for anonymous calling. Your privacy is protected - no photos or videos are stored.';
      case AppPermission.MICROPHONE:
        return 'This app needs microphone access for voice calls. All calls are end-to-end encrypted and anonymous.';
      default:
        return 'This permission is required for the app to function properly.';
    }
  }

  /**
   * Get default settings title
   */
  private getDefaultSettingsTitle(permission: AppPermission): string {
    switch (permission) {
      case AppPermission.CAMERA:
        return 'Camera Permission Blocked';
      case AppPermission.MICROPHONE:
        return 'Microphone Permission Blocked';
      default:
        return 'Permission Blocked';
    }
  }

  /**
   * Get default settings message
   */
  private getDefaultSettingsMessage(permission: AppPermission): string {
    switch (permission) {
      case AppPermission.CAMERA:
        return 'Camera access has been blocked. To scan QR codes, please enable camera permissions in Settings > Privacy > Camera.';
      case AppPermission.MICROPHONE:
        return 'Microphone access has been blocked. To make calls, please enable microphone permissions in Settings > Privacy > Microphone.';
      default:
        return 'This permission has been blocked. Please enable it in your device settings.';
    }
  }

  /**
   * Check if all required permissions are granted
   */
  async checkAllPermissions(permissions: AppPermission[]): Promise<{
    allGranted: boolean;
    results: PermissionResult[];
    missingPermissions: AppPermission[];
  }> {
    const results: PermissionResult[] = [];
    const missingPermissions: AppPermission[] = [];
    
    for (const permission of permissions) {
      const result = await this.checkPermission(permission);
      results.push(result);
      
      if (result.state !== PermissionState.GRANTED) {
        missingPermissions.push(permission);
      }
    }
    
    return {
      allGranted: missingPermissions.length === 0,
      results,
      missingPermissions,
    };
  }
}

/**
 * Default permission manager instance
 */
export const defaultPermissionManager = new PermissionManager();