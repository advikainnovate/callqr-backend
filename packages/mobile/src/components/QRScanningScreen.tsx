/**
 * QR Scanning Screen Component
 * 
 * Main screen for scanning QR codes with visual feedback and result handling.
 * Provides camera-based QR scanning with progress indicators and error handling.
 * 
 * Requirements: 9.2
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import QRScanner from './QRScanner';
import { QRScanResult, QRScanError, SecureToken } from '../types';

interface QRScanningScreenProps {
  onScanSuccess: (result: QRScanResult) => void;
  onScanCancel: () => void;
  onCallInitiate?: (result: QRScanResult) => void;
}

const { width, height } = Dimensions.get('window');

export const QRScanningScreen: React.FC<QRScanningScreenProps> = ({
  onScanSuccess,
  onScanCancel,
  onCallInitiate,
}) => {
  const [isScanning, setIsScanning] = useState(true);
  const [scanResult, setScanResult] = useState<QRScanResult | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);
  
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;

  /**
   * Start scanning progress animation
   */
  const startProgressAnimation = useCallback(() => {
    setScanProgress(0);
    Animated.timing(progressAnimation, {
      toValue: 1,
      duration: 30000, // 30 second timeout
      useNativeDriver: false,
    }).start();
  }, [progressAnimation]);

  /**
   * Start pulse animation for scanning indicator
   */
  const startPulseAnimation = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnimation]);

  /**
   * Stop all animations
   */
  const stopAnimations = useCallback(() => {
    progressAnimation.stopAnimation();
    pulseAnimation.stopAnimation();
  }, [progressAnimation, pulseAnimation]);

  /**
   * Handle successful QR scan
   */
  const handleScanSuccess = useCallback((result: QRScanResult) => {
    stopAnimations();
    setIsScanning(false);
    setScanResult(result);
    
    if (result.success && result.token) {
      onScanSuccess(result);
      
      // Show success feedback
      Alert.alert(
        'QR Code Scanned Successfully',
        'Ready to initiate anonymous call. Would you like to proceed?',
        [
          { text: 'Cancel', style: 'cancel', onPress: handleResetScanner },
          { 
            text: 'Call Now', 
            onPress: () => onCallInitiate?.(result) 
          },
        ]
      );
    }
  }, [onScanSuccess, onCallInitiate, stopAnimations]);

  /**
   * Handle scan error
   */
  const handleScanError = useCallback((error: QRScanError, message?: string) => {
    stopAnimations();
    setIsScanning(false);
    
    let errorTitle = 'Scan Error';
    let errorMessage = message || 'Failed to scan QR code';
    
    switch (error) {
      case QRScanError.INVALID_FORMAT:
        errorTitle = 'Invalid QR Code';
        errorMessage = 'This QR code is not compatible with our app. Please scan a valid privacy calling QR code.';
        break;
      case QRScanError.MALFORMED_DATA:
        errorTitle = 'Corrupted QR Code';
        errorMessage = 'The QR code appears to be damaged or corrupted. Please ask for a new one.';
        break;
      case QRScanError.UNSUPPORTED_VERSION:
        errorTitle = 'Unsupported QR Code';
        errorMessage = 'This QR code uses a newer format. Please update your app.';
        break;
      case QRScanError.CAMERA_ERROR:
        errorTitle = 'Camera Error';
        errorMessage = 'Unable to access camera. Please check permissions and try again.';
        break;
      case QRScanError.SCAN_TIMEOUT:
        errorTitle = 'Scan Timeout';
        errorMessage = 'Scanning timed out. Please try again.';
        break;
    }
    
    Alert.alert(
      errorTitle,
      errorMessage,
      [
        { text: 'Cancel', style: 'cancel', onPress: onScanCancel },
        { text: 'Try Again', onPress: handleResetScanner },
      ]
    );
  }, [onScanCancel, stopAnimations]);

  /**
   * Handle permission denied
   */
  const handlePermissionDenied = useCallback(() => {
    Alert.alert(
      'Camera Permission Required',
      'This app needs camera access to scan QR codes. Please enable camera permissions in your device settings.',
      [
        { text: 'Cancel', style: 'cancel', onPress: onScanCancel },
        { text: 'Settings', onPress: () => {
          // In a real app, this would open device settings
          Alert.alert('Please enable camera permissions in Settings > Privacy > Camera');
        }},
      ]
    );
  }, [onScanCancel]);

  /**
   * Reset scanner to initial state
   */
  const handleResetScanner = useCallback(() => {
    setIsScanning(true);
    setScanResult(null);
    setScanProgress(0);
    progressAnimation.setValue(0);
    pulseAnimation.setValue(1);
    startProgressAnimation();
    startPulseAnimation();
  }, [progressAnimation, pulseAnimation, startProgressAnimation, startPulseAnimation]);

  /**
   * Handle cancel button
   */
  const handleCancel = useCallback(() => {
    stopAnimations();
    onScanCancel();
  }, [onScanCancel, stopAnimations]);

  /**
   * Start animations when scanning begins
   */
  React.useEffect(() => {
    if (isScanning) {
      startProgressAnimation();
      startPulseAnimation();
    }
    
    return () => {
      stopAnimations();
    };
  }, [isScanning, startProgressAnimation, startPulseAnimation, stopAnimations]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Scan QR Code</Text>
        <Text style={styles.subtitle}>
          Point your camera at a QR code to start an anonymous call
        </Text>
      </View>

      {/* Scanner */}
      <View style={styles.scannerContainer}>
        <QRScanner
          onScanSuccess={handleScanSuccess}
          onScanError={handleScanError}
          onPermissionDenied={handlePermissionDenied}
          isActive={isScanning}
          config={{
            timeoutMs: 30000,
            showMarker: true,
            markerStyle: {
              borderColor: '#00FF00',
              borderWidth: 3,
            },
            cameraStyle: {
              height: height * 0.6,
              width: width,
            },
          }}
        />

        {/* Scanning overlay */}
        {isScanning && (
          <View style={styles.scanningOverlay}>
            <Animated.View 
              style={[
                styles.scanningIndicator,
                { transform: [{ scale: pulseAnimation }] }
              ]}
            >
              <Text style={styles.scanningText}>Scanning...</Text>
            </Animated.View>
            
            {/* Progress bar */}
            <View style={styles.progressContainer}>
              <Animated.View 
                style={[
                  styles.progressBar,
                  {
                    width: progressAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  }
                ]}
              />
            </View>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        {!isScanning && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleResetScanner}
          >
            <Text style={styles.retryButtonText}>Scan Again</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionsText}>
          • Hold your device steady{'\n'}
          • Ensure good lighting{'\n'}
          • Keep the QR code within the frame{'\n'}
          • Wait for automatic detection
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
  },
  scanningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  scanningIndicator: {
    backgroundColor: 'rgba(0, 255, 0, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#00FF00',
  },
  scanningText: {
    color: '#00FF00',
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressContainer: {
    width: '80%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginTop: 20,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#00FF00',
    borderRadius: 2,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  cancelButton: {
    backgroundColor: '#f44336',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  instructions: {
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  instructionsText: {
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default QRScanningScreen;