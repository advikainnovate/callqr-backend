/**
 * Permission Request Screen Component
 * 
 * Provides clear user prompts for camera and microphone permissions
 * with graceful error handling and educational content.
 * 
 * Requirements: 9.5
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { 
  PermissionManager, 
  AppPermission, 
  PermissionState, 
  PermissionResult,
  defaultPermissionManager 
} from '../utils/permissionManager';

interface PermissionRequestScreenProps {
  requiredPermissions: AppPermission[];
  onPermissionsGranted: () => void;
  onPermissionsDenied: (missingPermissions: AppPermission[]) => void;
  title?: string;
  subtitle?: string;
  showSkipOption?: boolean;
}

interface PermissionInfo {
  permission: AppPermission;
  title: string;
  description: string;
  icon: string;
  importance: 'required' | 'optional';
  privacyNote: string;
}

export const PermissionRequestScreen: React.FC<PermissionRequestScreenProps> = ({
  requiredPermissions,
  onPermissionsGranted,
  onPermissionsDenied,
  title = 'Permissions Required',
  subtitle = 'This app needs certain permissions to provide anonymous calling features',
  showSkipOption = false,
}) => {
  const [permissionStates, setPermissionStates] = useState<Map<AppPermission, PermissionState>>(new Map());
  const [isRequesting, setIsRequesting] = useState(false);
  const [hasCheckedInitial, setHasCheckedInitial] = useState(false);

  /**
   * Permission information for display
   */
  const permissionInfo: PermissionInfo[] = [
    {
      permission: AppPermission.CAMERA,
      title: 'Camera Access',
      description: 'Required to scan QR codes for anonymous calling',
      icon: '📷',
      importance: 'required',
      privacyNote: 'No photos or videos are stored. Camera is only used for QR scanning.',
    },
    {
      permission: AppPermission.MICROPHONE,
      title: 'Microphone Access',
      description: 'Required for voice calls with end-to-end encryption',
      icon: '🎤',
      importance: 'required',
      privacyNote: 'All calls are encrypted and anonymous. No recordings are made.',
    },
  ];

  /**
   * Check current permission states
   */
  const checkPermissions = useCallback(async () => {
    const newStates = new Map<AppPermission, PermissionState>();
    
    for (const permission of requiredPermissions) {
      const result = await defaultPermissionManager.checkPermission(permission);
      newStates.set(permission, result.state);
    }
    
    setPermissionStates(newStates);
    setHasCheckedInitial(true);
    
    // Check if all permissions are already granted
    const allGranted = Array.from(newStates.values()).every(
      state => state === PermissionState.GRANTED
    );
    
    if (allGranted) {
      onPermissionsGranted();
    }
  }, [requiredPermissions, onPermissionsGranted]);

  /**
   * Request a specific permission
   */
  const requestPermission = useCallback(async (permission: AppPermission) => {
    setIsRequesting(true);
    
    try {
      const result = await defaultPermissionManager.requestPermission(permission, {
        showRationale: true,
      });
      
      setPermissionStates(prev => new Map(prev.set(permission, result.state)));
      
      if (result.state === PermissionState.BLOCKED) {
        Alert.alert(
          'Permission Blocked',
          'This permission has been permanently blocked. Please enable it in your device settings to use this feature.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error requesting permission:', error);
      Alert.alert(
        'Permission Error',
        'Failed to request permission. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsRequesting(false);
    }
  }, []);

  /**
   * Request all permissions
   */
  const requestAllPermissions = useCallback(async () => {
    setIsRequesting(true);
    
    try {
      const results = await defaultPermissionManager.requestMultiplePermissions(
        requiredPermissions,
        { showRationale: true }
      );
      
      // Update states
      const newStates = new Map<AppPermission, PermissionState>();
      results.forEach(result => {
        newStates.set(result.permission, result.state);
      });
      setPermissionStates(newStates);
      
      // Check if all required permissions are granted
      const grantedPermissions = results.filter(r => r.state === PermissionState.GRANTED);
      const deniedPermissions = results.filter(r => r.state !== PermissionState.GRANTED);
      
      if (grantedPermissions.length === requiredPermissions.length) {
        onPermissionsGranted();
      } else {
        onPermissionsDenied(deniedPermissions.map(r => r.permission));
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert(
        'Permission Error',
        'Failed to request permissions. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsRequesting(false);
    }
  }, [requiredPermissions, onPermissionsGranted, onPermissionsDenied]);

  /**
   * Handle skip permissions
   */
  const handleSkip = useCallback(() => {
    Alert.alert(
      'Skip Permissions',
      'Some features may not work properly without these permissions. Are you sure you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Skip', 
          style: 'destructive',
          onPress: () => onPermissionsDenied(requiredPermissions)
        },
      ]
    );
  }, [requiredPermissions, onPermissionsDenied]);

  /**
   * Get permission status icon
   */
  const getStatusIcon = (permission: AppPermission): string => {
    const state = permissionStates.get(permission);
    switch (state) {
      case PermissionState.GRANTED:
        return '✅';
      case PermissionState.DENIED:
        return '❌';
      case PermissionState.BLOCKED:
        return '🚫';
      default:
        return '❓';
    }
  };

  /**
   * Get permission status text
   */
  const getStatusText = (permission: AppPermission): string => {
    const state = permissionStates.get(permission);
    switch (state) {
      case PermissionState.GRANTED:
        return 'Granted';
      case PermissionState.DENIED:
        return 'Denied';
      case PermissionState.BLOCKED:
        return 'Blocked';
      case PermissionState.UNAVAILABLE:
        return 'Unavailable';
      default:
        return 'Not Requested';
    }
  };

  /**
   * Check permissions on mount
   */
  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  if (!hasCheckedInitial) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Checking permissions...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {/* Permission List */}
      <View style={styles.permissionsList}>
        {permissionInfo
          .filter(info => requiredPermissions.includes(info.permission))
          .map((info) => (
            <View key={info.permission} style={styles.permissionItem}>
              <View style={styles.permissionHeader}>
                <Text style={styles.permissionIcon}>{info.icon}</Text>
                <View style={styles.permissionTitleContainer}>
                  <Text style={styles.permissionTitle}>{info.title}</Text>
                  <Text style={styles.permissionDescription}>{info.description}</Text>
                </View>
                <View style={styles.permissionStatus}>
                  <Text style={styles.statusIcon}>
                    {getStatusIcon(info.permission)}
                  </Text>
                  <Text style={styles.statusText}>
                    {getStatusText(info.permission)}
                  </Text>
                </View>
              </View>
              
              <View style={styles.privacyNote}>
                <Text style={styles.privacyText}>
                  🔒 {info.privacyNote}
                </Text>
              </View>
              
              {permissionStates.get(info.permission) !== PermissionState.GRANTED && (
                <TouchableOpacity
                  style={styles.requestButton}
                  onPress={() => requestPermission(info.permission)}
                  disabled={isRequesting}
                >
                  <Text style={styles.requestButtonText}>
                    {permissionStates.get(info.permission) === PermissionState.BLOCKED 
                      ? 'Open Settings' 
                      : 'Grant Permission'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={requestAllPermissions}
          disabled={isRequesting}
        >
          <Text style={styles.primaryButtonText}>
            {isRequesting ? 'Requesting...' : 'Grant All Permissions'}
          </Text>
        </TouchableOpacity>

        {showSkipOption && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleSkip}
            disabled={isRequesting}
          >
            <Text style={styles.secondaryButtonText}>Skip for Now</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Information */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>Why These Permissions?</Text>
        <Text style={styles.infoText}>
          • Camera: Scan QR codes to initiate anonymous calls{'\n'}
          • Microphone: Enable voice communication during calls{'\n'}
          • All data is encrypted and no personal information is stored{'\n'}
          • You can revoke permissions anytime in device settings
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  permissionsList: {
    paddingHorizontal: 20,
  },
  permissionItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  permissionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  permissionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  permissionTitleContainer: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  permissionDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  permissionStatus: {
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  privacyNote: {
    backgroundColor: '#e8f5e8',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  privacyText: {
    fontSize: 12,
    color: '#2e7d32',
    lineHeight: 16,
  },
  requestButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  requestButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  actions: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  infoContainer: {
    margin: 20,
    padding: 16,
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1565c0',
    lineHeight: 20,
  },
});

export default PermissionRequestScreen;