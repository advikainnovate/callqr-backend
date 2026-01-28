/**
 * Call Screen Component
 * 
 * Main interface for active calls with privacy-compliant status display
 * and standard call controls (answer, end, mute).
 * 
 * Requirements: 9.3, 9.4
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { AnonymousSessionId } from '../types';

export enum CallStatus {
  INITIATING = 'initiating',
  RINGING = 'ringing',
  CONNECTED = 'connected',
  ENDED = 'ended',
  FAILED = 'failed',
}

export enum CallDirection {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing',
}

interface CallScreenProps {
  sessionId: AnonymousSessionId;
  status: CallStatus;
  direction: CallDirection;
  duration?: number; // in seconds
  onAnswer?: () => void;
  onEnd: () => void;
  onMute?: (muted: boolean) => void;
  onSpeaker?: (enabled: boolean) => void;
  isAudioMuted?: boolean;
  isSpeakerEnabled?: boolean;
}

const { width, height } = Dimensions.get('window');

export const CallScreen: React.FC<CallScreenProps> = ({
  sessionId,
  status,
  direction,
  duration = 0,
  onAnswer,
  onEnd,
  onMute,
  onSpeaker,
  isAudioMuted = false,
  isSpeakerEnabled = false,
}) => {
  const [callDuration, setCallDuration] = useState(duration);
  const [isMuted, setIsMuted] = useState(isAudioMuted);
  const [speakerEnabled, setSpeakerEnabled] = useState(isSpeakerEnabled);
  
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const fadeAnimation = useRef(new Animated.Value(0)).current;

  /**
   * Format call duration for display
   */
  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  /**
   * Start pulse animation for ringing state
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
   * Start fade in animation
   */
  const startFadeAnimation = useCallback(() => {
    Animated.timing(fadeAnimation, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnimation]);

  /**
   * Handle answer call
   */
  const handleAnswer = useCallback(() => {
    onAnswer?.();
  }, [onAnswer]);

  /**
   * Handle end call with confirmation
   */
  const handleEnd = useCallback(() => {
    if (status === CallStatus.CONNECTED) {
      Alert.alert(
        'End Call',
        'Are you sure you want to end this call?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'End Call', style: 'destructive', onPress: onEnd },
        ]
      );
    } else {
      onEnd();
    }
  }, [status, onEnd]);

  /**
   * Handle mute toggle
   */
  const handleMute = useCallback(() => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    onMute?.(newMutedState);
  }, [isMuted, onMute]);

  /**
   * Handle speaker toggle
   */
  const handleSpeaker = useCallback(() => {
    const newSpeakerState = !speakerEnabled;
    setSpeakerEnabled(newSpeakerState);
    onSpeaker?.(newSpeakerState);
  }, [speakerEnabled, onSpeaker]);

  /**
   * Update call duration timer
   */
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (status === CallStatus.CONNECTED) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [status]);

  /**
   * Start animations based on call status
   */
  useEffect(() => {
    if (status === CallStatus.RINGING) {
      startPulseAnimation();
    } else {
      pulseAnimation.stopAnimation();
      pulseAnimation.setValue(1);
    }
    
    startFadeAnimation();
  }, [status, startPulseAnimation, startFadeAnimation, pulseAnimation]);

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
        return formatDuration(callDuration);
      case CallStatus.ENDED:
        return 'Call Ended';
      case CallStatus.FAILED:
        return 'Call Failed';
      default:
        return 'Unknown Status';
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

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnimation }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Anonymous Call</Text>
        <Text style={styles.sessionInfo}>
          Session: {sessionId.slice(-8)}
        </Text>
      </View>

      {/* Call Status */}
      <View style={styles.statusContainer}>
        <Animated.View 
          style={[
            styles.statusIndicator,
            { 
              backgroundColor: getStatusColor(),
              transform: status === CallStatus.RINGING ? [{ scale: pulseAnimation }] : []
            }
          ]}
        >
          <Text style={styles.statusIcon}>
            {status === CallStatus.CONNECTED ? '📞' : 
             status === CallStatus.RINGING ? '📳' : 
             status === CallStatus.FAILED ? '❌' : '⏳'}
          </Text>
        </Animated.View>
        
        <Text style={[styles.statusText, { color: getStatusColor() }]}>
          {getStatusText()}
        </Text>
        
        <Text style={styles.privacyText}>
          🔒 Your identity is protected
        </Text>
      </View>

      {/* Call Controls */}
      <View style={styles.controlsContainer}>
        {/* Primary Controls Row */}
        <View style={styles.primaryControls}>
          {/* Answer Button (only for incoming calls) */}
          {direction === CallDirection.INCOMING && 
           (status === CallStatus.RINGING || status === CallStatus.INITIATING) && (
            <TouchableOpacity
              style={[styles.controlButton, styles.answerButton]}
              onPress={handleAnswer}
            >
              <Text style={styles.controlButtonText}>📞</Text>
              <Text style={styles.controlLabel}>Answer</Text>
            </TouchableOpacity>
          )}

          {/* End Call Button */}
          <TouchableOpacity
            style={[styles.controlButton, styles.endButton]}
            onPress={handleEnd}
          >
            <Text style={styles.controlButtonText}>📵</Text>
            <Text style={styles.controlLabel}>
              {status === CallStatus.CONNECTED ? 'End' : 'Cancel'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Secondary Controls Row (only when connected) */}
        {status === CallStatus.CONNECTED && (
          <View style={styles.secondaryControls}>
            <TouchableOpacity
              style={[
                styles.controlButton, 
                styles.secondaryButton,
                isMuted && styles.activeButton
              ]}
              onPress={handleMute}
            >
              <Text style={styles.controlButtonText}>
                {isMuted ? '🔇' : '🎤'}
              </Text>
              <Text style={styles.controlLabel}>
                {isMuted ? 'Unmute' : 'Mute'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.controlButton, 
                styles.secondaryButton,
                speakerEnabled && styles.activeButton
              ]}
              onPress={handleSpeaker}
            >
              <Text style={styles.controlButtonText}>
                {speakerEnabled ? '🔊' : '🔈'}
              </Text>
              <Text style={styles.controlLabel}>Speaker</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Call Information */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>Call Information</Text>
        <Text style={styles.infoText}>
          • End-to-end encrypted communication{'\n'}
          • No personal information is shared{'\n'}
          • Call is not recorded or monitored{'\n'}
          • Anonymous session will end when call ends
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  sessionInfo: {
    fontSize: 14,
    color: '#ccc',
    fontFamily: 'monospace',
  },
  statusContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  statusIndicator: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusIcon: {
    fontSize: 48,
  },
  statusText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  privacyText: {
    fontSize: 16,
    color: '#4CAF50',
    textAlign: 'center',
  },
  controlsContainer: {
    paddingHorizontal: 40,
    paddingBottom: 40,
  },
  primaryControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  secondaryControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  controlButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
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
  answerButton: {
    backgroundColor: '#4CAF50',
  },
  endButton: {
    backgroundColor: '#f44336',
  },
  secondaryButton: {
    backgroundColor: '#666',
  },
  activeButton: {
    backgroundColor: '#007AFF',
  },
  controlButtonText: {
    fontSize: 24,
    marginBottom: 4,
  },
  controlLabel: {
    fontSize: 12,
    color: 'white',
    fontWeight: '500',
  },
  infoContainer: {
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
});

export default CallScreen;