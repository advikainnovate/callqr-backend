/**
 * QR Code Display Component
 * 
 * This component displays QR codes containing only secure tokens,
 * ensuring no personal information is ever embedded or displayed.
 * 
 * Requirements: 9.1
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SecureToken } from '../types';

interface QRDisplayProps {
  token?: SecureToken | string;
  size?: number;
  showToken?: boolean;
  onRefresh?: () => void;
  isLoading?: boolean;
  error?: string;
}

const QRDisplay: React.FC<QRDisplayProps> = ({ 
  token, 
  size = 200, 
  showToken = false,
  onRefresh,
  isLoading = false,
  error
}) => {
  const [displayToken, setDisplayToken] = useState<string>('');

  // Extract token value for display
  useEffect(() => {
    if (typeof token === 'string') {
      setDisplayToken(token);
    } else if (token && typeof token === 'object') {
      // Format SecureToken for QR display: "pqc:version:value:checksum"
      setDisplayToken(`pqc:${token.version}:${token.value}:${token.checksum}`);
    } else {
      setDisplayToken('');
    }
  }, [token]);

  // Show loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={[styles.qrContainer, styles.loadingContainer]}>
          <Text style={styles.loadingText}>Generating QR Code...</Text>
        </View>
        <Text style={styles.instructionText}>
          Please wait while we create your secure QR code
        </Text>
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View style={styles.container}>
        <View style={[styles.qrContainer, styles.errorContainer]}>
          <Text style={styles.errorText}>⚠️ Error</Text>
          <Text style={styles.errorMessage}>{error}</Text>
        </View>
        {onRefresh && (
          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <Text style={styles.refreshButtonText}>Try Again</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Don't render if token is empty or invalid
  if (!displayToken || displayToken.length < 32) {
    return (
      <View style={styles.container}>
        <View style={[styles.qrContainer, styles.errorContainer]}>
          <Text style={styles.errorText}>Invalid or missing token</Text>
        </View>
        {onRefresh && (
          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <Text style={styles.refreshButtonText}>Generate New QR Code</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const handleQRPress = () => {
    Alert.alert(
      'QR Code Information',
      'This QR code contains only a secure token - no personal information is included. Share it safely to receive anonymous calls.',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handleQRPress} activeOpacity={0.8}>
        <View style={styles.qrContainer}>
          <QRCode
            value={displayToken}
            size={size}
            backgroundColor="white"
            color="black"
            testID="qr-code"
          />
        </View>
      </TouchableOpacity>
      
      <Text style={styles.instructionText}>
        Share this QR code to receive anonymous calls
      </Text>
      
      {onRefresh && (
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Text style={styles.refreshButtonText}>Generate New QR Code</Text>
        </TouchableOpacity>
      )}
      
      {showToken && displayToken && (
        <View style={styles.tokenContainer}>
          <Text style={styles.tokenLabel}>Token (for debugging):</Text>
          <Text style={styles.tokenText} numberOfLines={2} ellipsizeMode="middle">
            {displayToken}
          </Text>
        </View>
      )}
      
      <Text style={styles.privacyText}>
        🔒 Your privacy is protected - no personal information is shared
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 20,
  },
  qrContainer: {
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
    minWidth: 200,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
    minWidth: 200,
    backgroundColor: '#ffebee',
    borderColor: '#f44336',
    borderWidth: 1,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  instructionText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
    color: '#333',
    fontWeight: '500',
  },
  refreshButton: {
    marginTop: 16,
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
  tokenContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    width: '100%',
  },
  tokenLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  tokenText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#333',
  },
  privacyText: {
    marginTop: 16,
    fontSize: 14,
    color: '#4CAF50',
    textAlign: 'center',
    fontWeight: '500',
  },
  errorText: {
    fontSize: 16,
    color: '#f44336',
    textAlign: 'center',
    fontWeight: '600',
  },
  errorMessage: {
    fontSize: 14,
    color: '#f44336',
    textAlign: 'center',
    marginTop: 8,
  },
});

export default QRDisplay;