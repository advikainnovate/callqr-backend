/**
 * Call Status Display Component
 * 
 * Displays call status information without revealing personal information
 * about either party in the call.
 * 
 * Requirements: 9.3
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { AnonymousSessionId } from '../types';
import { CallStatus, CallDirection } from './CallScreen';

interface CallStatusDisplayProps {
  sessionId: AnonymousSessionId;
  status: CallStatus;
  direction: CallDirection;
  duration: number; // in seconds
  quality?: 'excellent' | 'good' | 'fair' | 'poor';
  isEncrypted?: boolean;
  onStatusPress?: () => void;
}

export const CallStatusDisplay: React.FC<CallStatusDisplayProps> = ({
  sessionId,
  status,
  direction,
  duration,
  quality = 'good',
  isEncrypted = true,
  onStatusPress,
}) => {
  const [displayDuration, setDisplayDuration] = useState(duration);

  /**
   * Format duration for display
   */
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Get status display text
   */
  const getStatusText = (): string => {
    switch (status) {
      case CallStatus.INITIATING:
        return direction === CallDirection.OUTGOING ? 'Connecting...' : 'Incoming Call';
      case CallStatus.RINGING:
        return direction === CallDirection.OUTGOING ? 'Ringing...' : 'Incoming Call';
      case CallStatus.CONNECTED:
        return 'Connected';
      case CallStatus.ENDED:
        return 'Call Ended';
      case CallStatus.FAILED:
        return 'Call Failed';
      default:
        return 'Unknown';
    }
  };

  /**
   * Get status color
   */
  const getStatusColor = (): string => {
    switch (status) {
      case CallStatus.INITIATING:
      case CallStatus.RINGING:
        return '#FF9800';
      case CallStatus.CONNECTED:
        return '#4CAF50';
      case CallStatus.ENDED:
        return '#666';
      case CallStatus.FAILED:
        return '#f44336';
      default:
        return '#666';
    }
  };

  /**
   * Get quality indicator
   */
  const getQualityIndicator = (): string => {
    switch (quality) {
      case 'excellent':
        return '📶📶📶📶';
      case 'good':
        return '📶📶📶';
      case 'fair':
        return '📶📶';
      case 'poor':
        return '📶';
      default:
        return '📶📶📶';
    }
  };

  /**
   * Get quality color
   */
  const getQualityColor = (): string => {
    switch (quality) {
      case 'excellent':
        return '#4CAF50';
      case 'good':
        return '#8BC34A';
      case 'fair':
        return '#FF9800';
      case 'poor':
        return '#f44336';
      default:
        return '#8BC34A';
    }
  };

  /**
   * Update duration display
   */
  useEffect(() => {
    setDisplayDuration(duration);
  }, [duration]);

  return (
    <TouchableOpacity 
      style={styles.container}
      onPress={onStatusPress}
      activeOpacity={0.8}
    >
      {/* Main Status */}
      <View style={styles.statusRow}>
        <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
        <Text style={[styles.statusText, { color: getStatusColor() }]}>
          {getStatusText()}
        </Text>
        {status === CallStatus.CONNECTED && (
          <Text style={styles.durationText}>
            {formatDuration(displayDuration)}
          </Text>
        )}
      </View>

      {/* Session Information */}
      <View style={styles.sessionRow}>
        <Text style={styles.sessionLabel}>Session:</Text>
        <Text style={styles.sessionId}>{sessionId.slice(-12)}</Text>
        <Text style={styles.directionText}>
          {direction === CallDirection.INCOMING ? '📥' : '📤'}
        </Text>
      </View>

      {/* Quality and Security */}
      {status === CallStatus.CONNECTED && (
        <View style={styles.detailsRow}>
          <View style={styles.qualityContainer}>
            <Text style={styles.qualityLabel}>Quality:</Text>
            <Text style={[styles.qualityIndicator, { color: getQualityColor() }]}>
              {getQualityIndicator()}
            </Text>
            <Text style={[styles.qualityText, { color: getQualityColor() }]}>
              {quality}
            </Text>
          </View>
          
          <View style={styles.securityContainer}>
            <Text style={styles.securityIcon}>
              {isEncrypted ? '🔒' : '🔓'}
            </Text>
            <Text style={[styles.securityText, { color: isEncrypted ? '#4CAF50' : '#f44336' }]}>
              {isEncrypted ? 'Encrypted' : 'Not Encrypted'}
            </Text>
          </View>
        </View>
      )}

      {/* Privacy Notice */}
      <View style={styles.privacyRow}>
        <Text style={styles.privacyText}>
          🔒 Anonymous call - no personal information shared
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    padding: 16,
    margin: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  durationText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
    fontFamily: 'monospace',
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionLabel: {
    fontSize: 12,
    color: '#999',
    marginRight: 4,
  },
  sessionId: {
    fontSize: 12,
    color: '#ccc',
    fontFamily: 'monospace',
    flex: 1,
  },
  directionText: {
    fontSize: 16,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  qualityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  qualityLabel: {
    fontSize: 12,
    color: '#999',
    marginRight: 4,
  },
  qualityIndicator: {
    fontSize: 12,
    marginRight: 4,
  },
  qualityText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  securityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  securityIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  securityText: {
    fontSize: 12,
    fontWeight: '500',
  },
  privacyRow: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 8,
  },
  privacyText: {
    fontSize: 12,
    color: '#4CAF50',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default CallStatusDisplay;