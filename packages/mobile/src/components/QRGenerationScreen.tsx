/**
 * QR Generation Screen Component
 * 
 * Main screen for generating and displaying QR codes with privacy-compliant information.
 * Handles token generation, refresh, and user interaction.
 * 
 * Requirements: 9.1
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import QRDisplay from './QRDisplay';
import { SecureToken } from '../types';

interface QRGenerationScreenProps {
  onTokenGenerated?: () => Promise<void>;
  onError?: (error: string) => void;
  token?: SecureToken | null;
}

/**
 * Mock token generation service
 * In production, this would call the backend API
 */
const generateSecureToken = async (): Promise<SecureToken> => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Generate a mock secure token (in production, this comes from backend)
  const tokenValue = Array.from({ length: 64 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  
  const checksum = Array.from({ length: 8 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  
  return {
    value: tokenValue,
    version: 1,
    checksum,
    createdAt: new Date(),
  };
};

export const QRGenerationScreen: React.FC<QRGenerationScreenProps> = ({
  onTokenGenerated,
  onError,
  token: providedToken,
}) => {
  const [token, setToken] = useState<SecureToken | null>(providedToken || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Update token when provided token changes
  useEffect(() => {
    if (providedToken) {
      setToken(providedToken);
    }
  }, [providedToken]);

  /**
   * Generate a new secure token through integration
   */
  const generateToken = useCallback(async () => {
    if (!onTokenGenerated) {
      // Fallback to mock generation if no integration
      setIsLoading(true);
      setError(null);
      
      try {
        const newToken = await generateSecureToken();
        setToken(newToken);
      } catch (err) {
        const errorMessage = 'Failed to generate secure token. Please try again.';
        setError(errorMessage);
        onError?.(errorMessage);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      await onTokenGenerated();
      // Token will be updated via providedToken prop
    } catch (err) {
      const errorMessage = 'Failed to generate secure token. Please try again.';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [onTokenGenerated, onError]);

  /**
   * Handle refresh gesture
   */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await generateToken();
    setRefreshing(false);
  }, [generateToken]);

  /**
   * Handle manual refresh button
   */
  const handleManualRefresh = useCallback(() => {
    Alert.alert(
      'Generate New QR Code',
      'This will invalidate your current QR code and create a new one. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate', onPress: generateToken },
      ]
    );
  }, [generateToken]);

  /**
   * Show QR code information
   */
  const showQRInfo = useCallback(() => {
    Alert.alert(
      'About Your QR Code',
      'Your QR code contains only a secure token - no personal information like your name, phone number, or email is included.\n\n' +
      'When someone scans this code, they can call you anonymously without knowing who you are.\n\n' +
      'You can generate a new QR code at any time to invalidate the old one.',
      [{ text: 'Got it' }]
    );
  }, []);

  /**
   * Generate initial token on mount only if no token provided
   */
  useEffect(() => {
    if (!providedToken) {
      generateToken();
    }
  }, [generateToken, providedToken]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Your QR Code</Text>
        <Text style={styles.subtitle}>
          Share this code to receive anonymous calls
        </Text>
      </View>

      <QRDisplay
        token={token || undefined}
        size={250}
        isLoading={isLoading}
        error={error || undefined}
        onRefresh={handleManualRefresh}
        showToken={__DEV__} // Only show token in development
      />

      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={styles.infoButton}
          onPress={showQRInfo}
        >
          <Text style={styles.infoButtonText}>ℹ️ How it works</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleManualRefresh}
          disabled={isLoading}
        >
          <Text style={styles.refreshButtonText}>
            {isLoading ? 'Generating...' : '🔄 Generate New Code'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.privacyInfo}>
        <Text style={styles.privacyTitle}>Privacy Protection</Text>
        <Text style={styles.privacyText}>
          • No personal information is stored in the QR code{'\n'}
          • Your identity remains anonymous during calls{'\n'}
          • You can revoke access by generating a new code{'\n'}
          • All communications are end-to-end encrypted
        </Text>
      </View>

      <View style={styles.instructions}>
        <Text style={styles.instructionsTitle}>How to use:</Text>
        <Text style={styles.instructionsText}>
          1. Show this QR code to someone who wants to call you{'\n'}
          2. They scan it with their app{'\n'}
          3. They can call you without knowing your phone number{'\n'}
          4. Generate a new code anytime to change access
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
  header: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginTop: 20,
  },
  infoButton: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2196f3',
  },
  infoButtonText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: '500',
  },
  refreshButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  privacyInfo: {
    margin: 20,
    padding: 16,
    backgroundColor: '#e8f5e8',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  privacyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
  },
  privacyText: {
    fontSize: 14,
    color: '#388e3c',
    lineHeight: 20,
  },
  instructions: {
    margin: 20,
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});

export default QRGenerationScreen;