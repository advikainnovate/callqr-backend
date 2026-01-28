/**
 * Incoming Call Notification Component
 * 
 * Handles incoming call notifications and interface without revealing
 * personal information about the caller.
 * 
 * Requirements: 9.4
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { AnonymousSessionId } from '../types';

interface IncomingCallNotificationProps {
  sessionId: AnonymousSessionId;
  isVisible: boolean;
  onAnswer: () => void;
  onDecline: () => void;
  onIgnore?: () => void;
  duration?: number; // Auto-dismiss after duration (seconds)
}

const { width, height } = Dimensions.get('window');

export const IncomingCallNotification: React.FC<IncomingCallNotificationProps> = ({
  sessionId,
  isVisible,
  onAnswer,
  onDecline,
  onIgnore,
  duration = 30, // 30 seconds default
}) => {
  const slideAnimation = useRef(new Animated.Value(-height)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<NodeJS.Timeout>();

  /**
   * Show notification with slide animation
   */
  const showNotification = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnimation, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.timing(progressAnimation, {
        toValue: 1,
        duration: duration * 1000,
        useNativeDriver: false,
      }),
    ]).start();

    // Start pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1.1,
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

    // Auto-dismiss after duration
    if (duration > 0) {
      timeoutRef.current = setTimeout(() => {
        handleIgnore();
      }, duration * 1000);
    }
  }, [slideAnimation, progressAnimation, pulseAnimation, duration]);

  /**
   * Hide notification with slide animation
   */
  const hideNotification = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    pulseAnimation.stopAnimation();
    progressAnimation.stopAnimation();

    Animated.timing(slideAnimation, {
      toValue: -height,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [slideAnimation, pulseAnimation, progressAnimation]);

  /**
   * Handle answer call
   */
  const handleAnswer = useCallback(() => {
    hideNotification();
    onAnswer();
  }, [hideNotification, onAnswer]);

  /**
   * Handle decline call
   */
  const handleDecline = useCallback(() => {
    hideNotification();
    onDecline();
  }, [hideNotification, onDecline]);

  /**
   * Handle ignore call (auto-dismiss)
   */
  const handleIgnore = useCallback(() => {
    hideNotification();
    onIgnore?.();
  }, [hideNotification, onIgnore]);

  /**
   * Handle swipe gestures (simplified)
   */
  const handleSwipeUp = useCallback(() => {
    Alert.alert(
      'Incoming Anonymous Call',
      'Someone is trying to reach you through a QR code scan. This call is completely anonymous.',
      [
        { text: 'Decline', style: 'cancel', onPress: handleDecline },
        { text: 'Answer', onPress: handleAnswer },
      ]
    );
  }, [handleAnswer, handleDecline]);

  /**
   * Show/hide notification based on visibility
   */
  useEffect(() => {
    if (isVisible) {
      showNotification();
    } else {
      hideNotification();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isVisible, showNotification, hideNotification]);

  if (!isVisible) {
    return null;
  }

  return (
    <Animated.View 
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnimation }],
        },
      ]}
    >
      {/* Progress bar */}
      <Animated.View 
        style={[
          styles.progressBar,
          {
            width: progressAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: ['100%', '0%'],
            }),
          }
        ]}
      />

      {/* Notification content */}
      <TouchableOpacity 
        style={styles.content}
        onPress={handleSwipeUp}
        activeOpacity={0.9}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Incoming Call</Text>
          <Text style={styles.subtitle}>Anonymous Caller</Text>
        </View>

        <Animated.View 
          style={[
            styles.callIndicator,
            { transform: [{ scale: pulseAnimation }] }
          ]}
        >
          <Text style={styles.callIcon}>📞</Text>
        </Animated.View>

        <View style={styles.sessionInfo}>
          <Text style={styles.sessionText}>
            Session: {sessionId.slice(-8)}
          </Text>
          <Text style={styles.privacyText}>
            🔒 Your identity is protected
          </Text>
        </View>
      </TouchableOpacity>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.declineButton]}
          onPress={handleDecline}
        >
          <Text style={styles.actionButtonText}>📵</Text>
          <Text style={styles.actionLabel}>Decline</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.answerButton]}
          onPress={handleAnswer}
        >
          <Text style={styles.actionButtonText}>📞</Text>
          <Text style={styles.actionLabel}>Answer</Text>
        </TouchableOpacity>
      </View>

      {/* Swipe hint */}
      <View style={styles.swipeHint}>
        <Text style={styles.swipeHintText}>
          Tap for options • Auto-dismiss in {Math.ceil(duration)} seconds
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a1a',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
    zIndex: 1000,
  },
  progressBar: {
    height: 3,
    backgroundColor: '#FF9800',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
  },
  callIndicator: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF9800',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  callIcon: {
    fontSize: 32,
  },
  sessionInfo: {
    alignItems: 'center',
  },
  sessionText: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  privacyText: {
    fontSize: 14,
    color: '#4CAF50',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
    paddingBottom: 20,
  },
  actionButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
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
  declineButton: {
    backgroundColor: '#f44336',
  },
  answerButton: {
    backgroundColor: '#4CAF50',
  },
  actionButtonText: {
    fontSize: 24,
    marginBottom: 2,
  },
  actionLabel: {
    fontSize: 10,
    color: 'white',
    fontWeight: '500',
  },
  swipeHint: {
    paddingHorizontal: 20,
    paddingBottom: 15,
    alignItems: 'center',
  },
  swipeHintText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});

export default IncomingCallNotification;