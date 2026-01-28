/**
 * Privacy-Preserving QR-Based Calling System - Mobile App Entry Point
 * 
 * This is the main React Native application component that provides
 * QR code scanning, generation, and anonymous calling functionality.
 * Now uses the integrated app architecture for better coordination.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  useColorScheme,
  Alert,
} from 'react-native';

import QRGenerationScreen from './components/QRGenerationScreen';
import QRScanningScreen from './components/QRScanningScreen';
import CallScreen, { CallStatus, CallDirection } from './components/CallScreen';
import IncomingCallNotification from './components/IncomingCallNotification';
import PermissionRequestScreen from './components/PermissionRequestScreen';
import { 
  SecureToken, 
  AnonymousSessionId, 
  AppPermission,
  QRScanResult,
} from './types';
import { defaultPermissionManager, PermissionState } from './utils/permissionManager';
import { appIntegration, AppIntegrationConfig, CallSession } from './integration/appIntegration';

enum AppScreen {
  PERMISSIONS = 'permissions',
  HOME = 'home',
  QR_GENERATION = 'qr_generation',
  QR_SCANNING = 'qr_scanning',
  CALL = 'call',
}

function App(): JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.PERMISSIONS);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [currentCall, setCurrentCall] = useState<CallSession | null>(null);
  const [currentToken, setCurrentToken] = useState<SecureToken | null>(null);
  const [showIncomingCall, setShowIncomingCall] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Initialize app integration on mount
   */
  useEffect(() => {
    initializeApp();
  }, []);

  /**
   * Initialize the app with integrated services
   */
  const initializeApp = async () => {
    try {
      const config: AppIntegrationConfig = {
        backend: {
          baseUrl: process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000',
          apiVersion: 'v1',
          timeout: 30000
        },
        webrtc: {
          stunServers: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302'
          ],
          turnServers: [
            {
              urls: 'turn:localhost:3478',
              username: 'user',
              credential: 'pass'
            }
          ]
        },
        privacy: {
          tokenRefreshIntervalMinutes: 60,
          callTimeoutMinutes: 30
        }
      };

      await appIntegration.initialize(config);
      
      // Setup event listeners
      setupAppIntegrationListeners();
      
      setIsInitialized(true);
      await checkInitialPermissions();

    } catch (error) {
      console.error('Failed to initialize app:', error);
      Alert.alert('Initialization Error', 'Failed to initialize the app. Please restart.');
    }
  };

  /**
   * Setup app integration event listeners
   */
  const setupAppIntegrationListeners = () => {
    appIntegration.on('token-generated', (token: SecureToken) => {
      setCurrentToken(token);
    });

    appIntegration.on('call-initiated', (callSession: CallSession) => {
      setCurrentCall(callSession);
      setCurrentScreen(AppScreen.CALL);
    });

    appIntegration.on('incoming-call', (callSession: CallSession) => {
      setCurrentCall(callSession);
      setShowIncomingCall(true);
    });

    appIntegration.on('call-answered', (callSession: CallSession) => {
      setCurrentCall(callSession);
      setShowIncomingCall(false);
      setCurrentScreen(AppScreen.CALL);
    });

    appIntegration.on('call-ended', (callSession: CallSession) => {
      setCurrentCall(null);
      setCurrentScreen(AppScreen.HOME);
    });

    appIntegration.on('call-status-changed', (callSession: CallSession) => {
      setCurrentCall(callSession);
    });
  };

  /**
   * Check permissions on app start
   */
  const checkInitialPermissions = async () => {
    const requiredPermissions = [AppPermission.CAMERA, AppPermission.MICROPHONE];
    const result = await defaultPermissionManager.checkAllPermissions(requiredPermissions);
    
    if (result.allGranted) {
      setHasPermissions(true);
      setCurrentScreen(AppScreen.HOME);
    } else {
      setCurrentScreen(AppScreen.PERMISSIONS);
    }
  };

  /**
   * Handle permissions granted
   */
  const handlePermissionsGranted = () => {
    setHasPermissions(true);
    setCurrentScreen(AppScreen.HOME);
  };

  /**
   * Handle permissions denied
   */
  const handlePermissionsDenied = (missingPermissions: AppPermission[]) => {
    console.log('Missing permissions:', missingPermissions);
    // For now, still allow access but with limited functionality
    setHasPermissions(false);
    setCurrentScreen(AppScreen.HOME);
  };

  /**
   * Handle QR scan success with integrated processing
   */
  const handleQRScanSuccess = async (result: QRScanResult) => {
    try {
      await appIntegration.processQRScan(result);
      // Call initiation is handled by the integration event listeners
    } catch (error) {
      console.error('Failed to process QR scan:', error);
      Alert.alert('Call Failed', 'Failed to initiate call. Please try again.');
      setCurrentScreen(AppScreen.HOME);
    }
  };

  /**
   * Handle QR token generation
   */
  const handleGenerateToken = async () => {
    try {
      await appIntegration.generateQRToken();
      // Token generation is handled by the integration event listeners
    } catch (error) {
      console.error('Failed to generate token:', error);
      Alert.alert('Token Generation Failed', 'Failed to generate QR code. Please try again.');
    }
  };

  /**
   * Handle incoming call (simulated)
   */
  const simulateIncomingCall = async () => {
    const sessionId = `session-${Date.now()}` as AnonymousSessionId;
    try {
      await appIntegration.handleIncomingCall(sessionId);
    } catch (error) {
      console.error('Failed to handle incoming call:', error);
    }
  };

  /**
   * Handle answer incoming call
   */
  const handleAnswerCall = async () => {
    try {
      await appIntegration.answerCall();
    } catch (error) {
      console.error('Failed to answer call:', error);
      Alert.alert('Call Error', 'Failed to answer call.');
    }
  };

  /**
   * Handle decline incoming call
   */
  const handleDeclineCall = async () => {
    try {
      await appIntegration.endCall();
      setShowIncomingCall(false);
    } catch (error) {
      console.error('Failed to decline call:', error);
      setShowIncomingCall(false);
    }
  };

  /**
   * Handle end call
   */
  const handleEndCall = async () => {
    try {
      await appIntegration.endCall();
    } catch (error) {
      console.error('Failed to end call:', error);
      // Still update UI
      setCurrentCall(null);
      setCurrentScreen(AppScreen.HOME);
    }
  };

  /**
   * Handle navigation
   */
  const navigateToScreen = (screen: AppScreen) => {
    setCurrentScreen(screen);
  };

  /**
   * Render current screen
   */
  const renderCurrentScreen = () => {
    if (!isInitialized) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Initializing...</Text>
        </View>
      );
    }

    switch (currentScreen) {
      case AppScreen.PERMISSIONS:
        return (
          <PermissionRequestScreen
            requiredPermissions={[AppPermission.CAMERA, AppPermission.MICROPHONE]}
            onPermissionsGranted={handlePermissionsGranted}
            onPermissionsDenied={handlePermissionsDenied}
            showSkipOption={true}
          />
        );

      case AppScreen.QR_GENERATION:
        return (
          <QRGenerationScreen
            onTokenGenerated={handleGenerateToken}
            onError={(error) => console.error('QR Generation error:', error)}
            token={currentToken}
          />
        );

      case AppScreen.QR_SCANNING:
        return (
          <QRScanningScreen
            onScanSuccess={handleQRScanSuccess}
            onScanCancel={() => navigateToScreen(AppScreen.HOME)}
            onCallInitiate={(result) => handleQRScanSuccess(result)}
          />
        );

      case AppScreen.CALL:
        if (!currentCall) {
          navigateToScreen(AppScreen.HOME);
          return null;
        }
        return (
          <CallScreen
            sessionId={currentCall.sessionId}
            status={currentCall.status}
            direction={currentCall.direction}
            duration={currentCall.duration}
            onAnswer={handleAnswerCall}
            onEnd={handleEndCall}
            onMute={(muted) => console.log('Mute:', muted)}
            onSpeaker={(enabled) => console.log('Speaker:', enabled)}
          />
        );

      case AppScreen.HOME:
      default:
        return (
          <View style={styles.homeContainer}>
            {/* Simple home screen with navigation buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.homeButton}
                onPress={() => navigateToScreen(AppScreen.QR_GENERATION)}
              >
                <Text style={styles.homeButtonText}>📱 Generate QR Code</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.homeButton}
                onPress={() => navigateToScreen(AppScreen.QR_SCANNING)}
              >
                <Text style={styles.homeButtonText}>📷 Scan QR Code</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.homeButton}
                onPress={simulateIncomingCall}
              >
                <Text style={styles.homeButtonText}>📞 Simulate Incoming Call</Text>
              </TouchableOpacity>

              {/* Show current token status */}
              {currentToken && (
                <View style={styles.statusContainer}>
                  <Text style={styles.statusText}>
                    ✅ QR Code Ready
                  </Text>
                </View>
              )}

              {/* Show current call status */}
              {currentCall && (
                <View style={styles.statusContainer}>
                  <Text style={styles.statusText}>
                    📞 Call: {currentCall.status}
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={isDarkMode ? '#1a1a1a' : '#f8f9fa'}
      />
      
      {renderCurrentScreen()}
      
      {/* Incoming call notification overlay */}
      {showIncomingCall && currentCall && (
        <IncomingCallNotification
          sessionId={currentCall.sessionId}
          isVisible={showIncomingCall}
          onAnswer={handleAnswerCall}
          onDecline={handleDeclineCall}
          onIgnore={handleDeclineCall}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
  },
  homeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 300,
  },
  homeButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  homeButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  statusContainer: {
    backgroundColor: '#e8f5e8',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  statusText: {
    color: '#2e7d32',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default App;