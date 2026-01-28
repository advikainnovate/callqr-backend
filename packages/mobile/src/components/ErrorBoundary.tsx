/**
 * React Native Error Boundary Component
 * 
 * Catches JavaScript errors in the component tree and displays user-friendly error messages.
 */

import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { MobileErrorHandler, MobileErrorFactory, MobileError } from '../utils/errorHandler';

interface Props {
  children: ReactNode;
  fallback?: (error: MobileError, retry: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: MobileError | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Convert the error to a mobile error
    const mobileError = MobileErrorHandler.fromNetworkError(error);
    
    return {
      hasError: true,
      error: mobileError
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for debugging (in development)
    if (__DEV__) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
    
    // In production, you might want to send this to a crash reporting service
    // while ensuring privacy compliance
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReportError = () => {
    if (this.state.error) {
      Alert.alert(
        'Report Error',
        'Would you like to report this error to help us improve the app?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Report', 
            onPress: () => {
              // In a real app, this would send anonymized error data
              Alert.alert('Thank you', 'Error report sent successfully.');
            }
          }
        ]
      );
    }
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry);
      }

      // Default error UI
      return (
        <View style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.title}>
              {MobileErrorHandler.getCategoryTitle(this.state.error.category)}
            </Text>
            
            <Text style={styles.message}>
              {this.state.error.userMessage}
            </Text>
            
            <View style={styles.actionsContainer}>
              {MobileErrorHandler.getSuggestedActions(this.state.error).map((action, index) => (
                <Text key={index} style={styles.actionText}>
                  • {action}
                </Text>
              ))}
            </View>
            
            <View style={styles.buttonContainer}>
              {MobileErrorHandler.shouldShowRetry(this.state.error) && (
                <TouchableOpacity 
                  style={[styles.button, styles.retryButton]} 
                  onPress={this.handleRetry}
                >
                  <Text style={styles.buttonText}>Try Again</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity 
                style={[styles.button, styles.reportButton]} 
                onPress={this.handleReportError}
              >
                <Text style={styles.buttonText}>Report Issue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

// Functional error display component for specific errors
interface ErrorDisplayProps {
  error: MobileError;
  onRetry?: () => void;
  onDismiss?: () => void;
  style?: any;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onRetry,
  onDismiss,
  style
}) => {
  return (
    <View style={[styles.errorContainer, style]}>
      <Text style={styles.title}>
        {MobileErrorHandler.getCategoryTitle(error.category)}
      </Text>
      
      <Text style={styles.message}>
        {error.userMessage}
      </Text>
      
      <View style={styles.actionsContainer}>
        {MobileErrorHandler.getSuggestedActions(error).map((action, index) => (
          <Text key={index} style={styles.actionText}>
            • {action}
          </Text>
        ))}
      </View>
      
      <View style={styles.buttonContainer}>
        {onRetry && MobileErrorHandler.shouldShowRetry(error) && (
          <TouchableOpacity 
            style={[styles.button, styles.retryButton]} 
            onPress={onRetry}
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        )}
        
        {onDismiss && (
          <TouchableOpacity 
            style={[styles.button, styles.dismissButton]} 
            onPress={onDismiss}
          >
            <Text style={styles.buttonText}>Dismiss</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// Hook for handling errors in functional components
export const useErrorHandler = () => {
  const [error, setError] = React.useState<MobileError | null>(null);

  const handleError = React.useCallback((err: Error | MobileError) => {
    if (err instanceof Error) {
      setError(MobileErrorHandler.fromNetworkError(err));
    } else {
      setError(err);
    }
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  const retry = React.useCallback((retryFn: () => void) => {
    clearError();
    retryFn();
  }, [clearError]);

  return {
    error,
    handleError,
    clearError,
    retry,
    hasError: error !== null
  };
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  errorContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    maxWidth: 350,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  actionsContainer: {
    marginBottom: 20,
  },
  actionText: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
  },
  reportButton: {
    backgroundColor: '#FF9500',
  },
  dismissButton: {
    backgroundColor: '#8E8E93',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});