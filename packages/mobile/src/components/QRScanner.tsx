/**
 * QR Scanner Component
 * 
 * React Native component for scanning QR codes and extracting secure tokens.
 * Handles camera permissions, scanning UI, and token validation.
 * 
 * Requirements: 2.1, 2.2, 2.3
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import QRCodeScanner from 'react-native-qrcode-scanner';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { 
  QRScanResult, 
  QRScanError, 
  QRScannerConfig, 
  QRScannerState,
  CameraPermissionStatus,
  SecureToken 
} from '../types';
import { MobileTokenValidator } from '../utils/tokenValidator';

/**
 * QR Scanner component props
 */
interface QRScannerProps {
  onScanSuccess: (result: QRScanResult) => void;
  onScanError: (error: QRScanError, message?: string) => void;
  onPermissionDenied: () => void;
  config?: Partial<QRScannerConfig>;
  isActive?: boolean;
}

/**
 * Default scanner configuration
 */
const DEFAULT_CONFIG: QRScannerConfig = {
  timeoutMs: 30000, // 30 seconds timeout
  showMarker: true,
  markerStyle: {
    borderColor: '#00FF00',
    borderWidth: 2,
  },
  cameraStyle: {
    height: Dimensions.get('window').height * 0.6,
    width: Dimensions.get('window').width,
  },
};

/**
 * QR Scanner component
 */
export const QRScanner: React.FC<QRScannerProps> = ({
  onScanSuccess,
  onScanError,
  onPermissionDenied,
  config = {},
  isActive = true,
}) => {
  const [scannerState, setScannerState] = useState<QRScannerState>({
    isScanning: false,
    hasPermission: false,
    permissionStatus: CameraPermissionStatus.UNAVAILABLE,
  });

  const [tokenValidator] = useState(() => new MobileTokenValidator());
  const scannerConfig = { ...DEFAULT_CONFIG, ...config };

  /**
   * Check and request camera permissions
   */
  const checkCameraPermission = useCallback(async () => {
    try {
      const permission = Platform.OS === 'ios' 
        ? PERMISSIONS.IOS.CAMERA 
        : PERMISSIONS.ANDROID.CAMERA;

      const result = await check(permission);
      
      let permissionStatus: CameraPermissionStatus;
      let hasPermission = false;

      switch (result) {
        case RESULTS.GRANTED:
          permissionStatus = CameraPermissionStatus.GRANTED;
          hasPermission = true;
          break;
        case RESULTS.DENIED:
          permissionStatus = CameraPermissionStatus.DENIED;
          break;
        case RESULTS.BLOCKED:
          permissionStatus = CameraPermissionStatus.BLOCKED;
          break;
        default:
          permissionStatus = CameraPermissionStatus.UNAVAILABLE;
      }

      setScannerState(prev => ({
        ...prev,
        hasPermission,
        permissionStatus,
      }));

      // If denied, try to request permission
      if (result === RESULTS.DENIED) {
        const requestResult = await request(permission);
        if (requestResult === RESULTS.GRANTED) {
          setScannerState(prev => ({
            ...prev,
            hasPermission: true,
            permissionStatus: CameraPermissionStatus.GRANTED,
          }));
        } else {
          onPermissionDenied();
        }
      } else if (result === RESULTS.BLOCKED) {
        onPermissionDenied();
      }

    } catch (error) {
      console.error('Error checking camera permission:', error);
      setScannerState(prev => ({
        ...prev,
        error: 'Failed to check camera permissions',
      }));
      onScanError(QRScanError.CAMERA_ERROR, 'Failed to check camera permissions');
    }
  }, [onPermissionDenied, onScanError]);

  /**
   * Handle QR code scan
   */
  const handleScan = useCallback((e: any) => {
    if (!isActive || scannerState.isScanning) {
      return;
    }

    setScannerState(prev => ({ ...prev, isScanning: true }));

    try {
      const qrData = e.data;
      
      // Validate QR format first
      if (!tokenValidator.isValidQRFormat(qrData)) {
        const result: QRScanResult = {
          success: false,
          error: QRScanError.INVALID_FORMAT,
          rawData: qrData,
        };
        
        setScannerState(prev => ({ 
          ...prev, 
          isScanning: false,
          lastScanResult: result,
        }));
        
        onScanError(QRScanError.INVALID_FORMAT, 'Invalid QR code format');
        return;
      }

      // Extract and validate token
      const token = tokenValidator.extractTokenFromQR(qrData);
      
      if (!token) {
        const result: QRScanResult = {
          success: false,
          error: QRScanError.MALFORMED_DATA,
          rawData: qrData,
        };
        
        setScannerState(prev => ({ 
          ...prev, 
          isScanning: false,
          lastScanResult: result,
        }));
        
        onScanError(QRScanError.MALFORMED_DATA, 'Invalid token in QR code');
        return;
      }

      // Success - token extracted and validated
      const result: QRScanResult = {
        success: true,
        token,
        rawData: qrData,
      };

      setScannerState(prev => ({ 
        ...prev, 
        isScanning: false,
        lastScanResult: result,
      }));

      onScanSuccess(result);

    } catch (error) {
      console.error('Error processing QR scan:', error);
      
      const result: QRScanResult = {
        success: false,
        error: QRScanError.MALFORMED_DATA,
      };
      
      setScannerState(prev => ({ 
        ...prev, 
        isScanning: false,
        lastScanResult: result,
        error: 'Failed to process QR code',
      }));
      
      onScanError(QRScanError.MALFORMED_DATA, 'Failed to process QR code');
    }
  }, [isActive, scannerState.isScanning, tokenValidator, onScanSuccess, onScanError]);

  /**
   * Reset scanner state
   */
  const resetScanner = useCallback(() => {
    setScannerState(prev => ({
      ...prev,
      isScanning: false,
      lastScanResult: undefined,
      error: undefined,
    }));
  }, []);

  /**
   * Check permissions on mount and when active state changes
   */
  useEffect(() => {
    if (isActive) {
      checkCameraPermission();
    }
  }, [isActive, checkCameraPermission]);

  /**
   * Render permission request UI
   */
  const renderPermissionRequest = () => (
    <View style={styles.permissionContainer}>
      <Text style={styles.permissionTitle}>Camera Permission Required</Text>
      <Text style={styles.permissionText}>
        This app needs camera access to scan QR codes for anonymous calling.
      </Text>
      <TouchableOpacity 
        style={styles.permissionButton} 
        onPress={checkCameraPermission}
      >
        <Text style={styles.permissionButtonText}>Grant Permission</Text>
      </TouchableOpacity>
    </View>
  );

  /**
   * Render scanner UI
   */
  const renderScanner = () => (
    <View style={styles.scannerContainer}>
      <QRCodeScanner
        onRead={handleScan}
        showMarker={scannerConfig.showMarker}
        markerStyle={scannerConfig.markerStyle}
        cameraStyle={scannerConfig.cameraStyle}
        topContent={
          <View style={styles.topContent}>
            <Text style={styles.instructionText}>
              Point your camera at a QR code to start an anonymous call
            </Text>
          </View>
        }
        bottomContent={
          <View style={styles.bottomContent}>
            {scannerState.isScanning && (
              <Text style={styles.scanningText}>Scanning...</Text>
            )}
            {scannerState.error && (
              <Text style={styles.errorText}>{scannerState.error}</Text>
            )}
            <TouchableOpacity 
              style={styles.resetButton} 
              onPress={resetScanner}
            >
              <Text style={styles.resetButtonText}>Reset Scanner</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );

  // Don't render anything if not active
  if (!isActive) {
    return null;
  }

  // Render permission request if needed
  if (!scannerState.hasPermission) {
    return renderPermissionRequest();
  }

  // Render scanner
  return renderScanner();
};

/**
 * Styles
 */
const styles = StyleSheet.create({
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: '#333',
  },
  permissionText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    color: '#666',
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  scannerContainer: {
    flex: 1,
  },
  topContent: {
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  instructionText: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    lineHeight: 24,
  },
  bottomContent: {
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
  },
  scanningText: {
    fontSize: 16,
    color: '#00FF00',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#FF0000',
    marginBottom: 16,
    textAlign: 'center',
  },
  resetButton: {
    backgroundColor: '#666',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  resetButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default QRScanner;