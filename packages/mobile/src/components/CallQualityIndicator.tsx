/**
 * Call Quality Indicator Component
 * 
 * Displays call quality information and suggestions without compromising privacy.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

// Quality rating enum (matches backend)
export enum QualityRating {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
  UNACCEPTABLE = 'UNACCEPTABLE'
}

// Quality feedback interface (matches backend)
export interface QualityFeedback {
  rating: QualityRating;
  timestamp: Date;
  suggestions: string[];
  networkRecommendations: {
    suggestedBitrate?: number;
    suggestedCodec?: string;
    enableAdaptation: boolean;
  };
}

interface CallQualityIndicatorProps {
  qualityFeedback?: QualityFeedback;
  showDetails?: boolean;
  style?: any;
}

export const CallQualityIndicator: React.FC<CallQualityIndicatorProps> = ({
  qualityFeedback,
  showDetails = false,
  style
}) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (qualityFeedback) {
      // Fade in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Pulse animation for poor quality
      if (qualityFeedback.rating === QualityRating.POOR || 
          qualityFeedback.rating === QualityRating.UNACCEPTABLE) {
        const pulse = () => {
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.1,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
          ]).start(() => pulse());
        };
        pulse();
      }
    }
  }, [qualityFeedback, fadeAnim, pulseAnim]);

  if (!qualityFeedback) {
    return null;
  }

  const getQualityColor = (rating: QualityRating): string => {
    switch (rating) {
      case QualityRating.EXCELLENT:
        return '#4CAF50'; // Green
      case QualityRating.GOOD:
        return '#8BC34A'; // Light Green
      case QualityRating.FAIR:
        return '#FF9800'; // Orange
      case QualityRating.POOR:
        return '#FF5722'; // Deep Orange
      case QualityRating.UNACCEPTABLE:
        return '#F44336'; // Red
      default:
        return '#9E9E9E'; // Grey
    }
  };

  const getQualityIcon = (rating: QualityRating): string => {
    switch (rating) {
      case QualityRating.EXCELLENT:
        return '●●●●●';
      case QualityRating.GOOD:
        return '●●●●○';
      case QualityRating.FAIR:
        return '●●●○○';
      case QualityRating.POOR:
        return '●●○○○';
      case QualityRating.UNACCEPTABLE:
        return '●○○○○';
      default:
        return '○○○○○';
    }
  };

  const getQualityText = (rating: QualityRating): string => {
    switch (rating) {
      case QualityRating.EXCELLENT:
        return 'Excellent';
      case QualityRating.GOOD:
        return 'Good';
      case QualityRating.FAIR:
        return 'Fair';
      case QualityRating.POOR:
        return 'Poor';
      case QualityRating.UNACCEPTABLE:
        return 'Very Poor';
      default:
        return 'Unknown';
    }
  };

  const shouldShowWarning = (rating: QualityRating): boolean => {
    return rating === QualityRating.POOR || rating === QualityRating.UNACCEPTABLE;
  };

  return (
    <Animated.View 
      style={[
        styles.container, 
        style,
        { 
          opacity: fadeAnim,
          transform: [{ scale: pulseAnim }]
        }
      ]}
    >
      <View style={styles.qualityHeader}>
        <Text 
          style={[
            styles.qualityIcon, 
            { color: getQualityColor(qualityFeedback.rating) }
          ]}
        >
          {getQualityIcon(qualityFeedback.rating)}
        </Text>
        <Text 
          style={[
            styles.qualityText,
            { color: getQualityColor(qualityFeedback.rating) }
          ]}
        >
          {getQualityText(qualityFeedback.rating)}
        </Text>
      </View>

      {shouldShowWarning(qualityFeedback.rating) && (
        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>
            Call quality is poor
          </Text>
        </View>
      )}

      {showDetails && qualityFeedback.suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsTitle}>Suggestions:</Text>
          {qualityFeedback.suggestions.slice(0, 2).map((suggestion, index) => (
            <Text key={index} style={styles.suggestionText}>
              • {suggestion}
            </Text>
          ))}
        </View>
      )}
    </Animated.View>
  );
};

// Compact quality indicator for minimal display
export const CompactQualityIndicator: React.FC<{
  rating: QualityRating;
  style?: any;
}> = ({ rating, style }) => {
  const getQualityColor = (rating: QualityRating): string => {
    switch (rating) {
      case QualityRating.EXCELLENT:
        return '#4CAF50';
      case QualityRating.GOOD:
        return '#8BC34A';
      case QualityRating.FAIR:
        return '#FF9800';
      case QualityRating.POOR:
        return '#FF5722';
      case QualityRating.UNACCEPTABLE:
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  const getBars = (rating: QualityRating): number => {
    switch (rating) {
      case QualityRating.EXCELLENT:
        return 5;
      case QualityRating.GOOD:
        return 4;
      case QualityRating.FAIR:
        return 3;
      case QualityRating.POOR:
        return 2;
      case QualityRating.UNACCEPTABLE:
        return 1;
      default:
        return 0;
    }
  };

  const activeBars = getBars(rating);
  const color = getQualityColor(rating);

  return (
    <View style={[styles.compactContainer, style]}>
      {[1, 2, 3, 4, 5].map((bar) => (
        <View
          key={bar}
          style={[
            styles.qualityBar,
            {
              backgroundColor: bar <= activeBars ? color : '#E0E0E0',
              height: 4 + (bar * 2), // Increasing height
            }
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    padding: 12,
    margin: 8,
    minWidth: 200,
  },
  qualityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  qualityIcon: {
    fontSize: 16,
    fontFamily: 'monospace',
    marginRight: 8,
  },
  qualityText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  warningContainer: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  warningText: {
    fontSize: 12,
    color: '#FF5722',
    fontWeight: '500',
  },
  suggestionsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  suggestionsTitle: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
    marginBottom: 4,
  },
  suggestionText: {
    fontSize: 11,
    color: '#E0E0E0',
    lineHeight: 16,
    marginBottom: 2,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 14,
  },
  qualityBar: {
    width: 3,
    borderRadius: 1,
  },
});