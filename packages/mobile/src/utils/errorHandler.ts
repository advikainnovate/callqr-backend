/**
 * Mobile app error handling utilities
 * 
 * Provides user-friendly error handling and display for the React Native mobile app.
 */

// Error categories for mobile app
export enum MobileErrorCategory {
  NETWORK = 'NETWORK',
  PERMISSION = 'PERMISSION',
  QR_CODE = 'QR_CODE',
  CALL = 'CALL',
  AUTHENTICATION = 'AUTHENTICATION',
  SYSTEM = 'SYSTEM'
}

// Mobile-specific error interface
export interface MobileError {
  category: MobileErrorCategory;
  code: string;
  message: string;
  userMessage: string;
  retryable: boolean;
  timestamp: Date;
  context?: Record<string, unknown>;
}

// Error factory for mobile-specific errors
export class MobileErrorFactory {
  // Network errors
  static networkUnavailable(): MobileError {
    return {
      category: MobileErrorCategory.NETWORK,
      code: 'NETWORK_UNAVAILABLE',
      message: 'Network connection unavailable',
      userMessage: 'No internet connection. Please check your network settings.',
      retryable: true,
      timestamp: new Date()
    };
  }

  static serverUnavailable(): MobileError {
    return {
      category: MobileErrorCategory.NETWORK,
      code: 'SERVER_UNAVAILABLE',
      message: 'Server is unavailable',
      userMessage: 'Service is temporarily unavailable. Please try again later.',
      retryable: true,
      timestamp: new Date()
    };
  }

  static requestTimeout(): MobileError {
    return {
      category: MobileErrorCategory.NETWORK,
      code: 'REQUEST_TIMEOUT',
      message: 'Request timed out',
      userMessage: 'Request timed out. Please check your connection and try again.',
      retryable: true,
      timestamp: new Date()
    };
  }

  // Permission errors
  static cameraPermissionDenied(): MobileError {
    return {
      category: MobileErrorCategory.PERMISSION,
      code: 'CAMERA_PERMISSION_DENIED',
      message: 'Camera permission denied',
      userMessage: 'Camera access is required to scan QR codes. Please enable camera permission in settings.',
      retryable: false,
      timestamp: new Date()
    };
  }

  static microphonePermissionDenied(): MobileError {
    return {
      category: MobileErrorCategory.PERMISSION,
      code: 'MICROPHONE_PERMISSION_DENIED',
      message: 'Microphone permission denied',
      userMessage: 'Microphone access is required for calls. Please enable microphone permission in settings.',
      retryable: false,
      timestamp: new Date()
    };
  }

  // QR Code errors
  static invalidQRCode(): MobileError {
    return {
      category: MobileErrorCategory.QR_CODE,
      code: 'INVALID_QR_CODE',
      message: 'Invalid QR code format',
      userMessage: 'Invalid QR code. Please scan a valid calling QR code.',
      retryable: false,
      timestamp: new Date()
    };
  }

  static qrCodeExpired(): MobileError {
    return {
      category: MobileErrorCategory.QR_CODE,
      code: 'QR_CODE_EXPIRED',
      message: 'QR code has expired',
      userMessage: 'QR code has expired. Please ask for a new QR code.',
      retryable: false,
      timestamp: new Date()
    };
  }

  static scannerError(): MobileError {
    return {
      category: MobileErrorCategory.QR_CODE,
      code: 'SCANNER_ERROR',
      message: 'QR scanner error',
      userMessage: 'Unable to scan QR code. Please try again or restart the app.',
      retryable: true,
      timestamp: new Date()
    };
  }

  // Call errors
  static callConnectionFailed(): MobileError {
    return {
      category: MobileErrorCategory.CALL,
      code: 'CALL_CONNECTION_FAILED',
      message: 'Call connection failed',
      userMessage: 'Unable to connect call. Please check your connection and try again.',
      retryable: true,
      timestamp: new Date()
    };
  }

  static userUnavailable(): MobileError {
    return {
      category: MobileErrorCategory.CALL,
      code: 'USER_UNAVAILABLE',
      message: 'User is unavailable',
      userMessage: 'User is currently unavailable. Please try again later.',
      retryable: true,
      timestamp: new Date()
    };
  }

  static callTimeout(): MobileError {
    return {
      category: MobileErrorCategory.CALL,
      code: 'CALL_TIMEOUT',
      message: 'Call timed out',
      userMessage: 'Call timed out. The other party may be unavailable.',
      retryable: true,
      timestamp: new Date()
    };
  }

  static callQualityPoor(): MobileError {
    return {
      category: MobileErrorCategory.CALL,
      code: 'CALL_QUALITY_POOR',
      message: 'Poor call quality',
      userMessage: 'Call quality is poor. This may be due to network conditions.',
      retryable: false,
      timestamp: new Date()
    };
  }

  // Authentication errors
  static authenticationFailed(): MobileError {
    return {
      category: MobileErrorCategory.AUTHENTICATION,
      code: 'AUTHENTICATION_FAILED',
      message: 'Authentication failed',
      userMessage: 'Authentication failed. Please check your credentials and try again.',
      retryable: true,
      timestamp: new Date()
    };
  }

  static sessionExpired(): MobileError {
    return {
      category: MobileErrorCategory.AUTHENTICATION,
      code: 'SESSION_EXPIRED',
      message: 'Session expired',
      userMessage: 'Your session has expired. Please log in again.',
      retryable: false,
      timestamp: new Date()
    };
  }

  // System errors
  static unknownError(): MobileError {
    return {
      category: MobileErrorCategory.SYSTEM,
      code: 'UNKNOWN_ERROR',
      message: 'Unknown error occurred',
      userMessage: 'An unexpected error occurred. Please try again or restart the app.',
      retryable: true,
      timestamp: new Date()
    };
  }

  static appUpdateRequired(): MobileError {
    return {
      category: MobileErrorCategory.SYSTEM,
      code: 'APP_UPDATE_REQUIRED',
      message: 'App update required',
      userMessage: 'Please update the app to continue using this feature.',
      retryable: false,
      timestamp: new Date()
    };
  }
}

// Error handler for mobile app
export class MobileErrorHandler {
  // Convert API error response to mobile error
  static fromApiError(apiError: {
    error: string;
    code: string;
    timestamp: string;
    retryable: boolean;
  }): MobileError {
    const category = this.getCategoryFromCode(apiError.code);
    
    return {
      category,
      code: apiError.code,
      message: apiError.error,
      userMessage: apiError.error,
      retryable: apiError.retryable,
      timestamp: new Date(apiError.timestamp)
    };
  }

  // Convert network errors to mobile errors
  static fromNetworkError(error: Error): MobileError {
    if (error.message.includes('Network request failed')) {
      return MobileErrorFactory.networkUnavailable();
    }
    
    if (error.message.includes('timeout')) {
      return MobileErrorFactory.requestTimeout();
    }
    
    if (error.message.includes('500') || error.message.includes('503')) {
      return MobileErrorFactory.serverUnavailable();
    }
    
    return MobileErrorFactory.unknownError();
  }

  // Get error category from error code
  private static getCategoryFromCode(code: string): MobileErrorCategory {
    if (code.includes('NETWORK') || code.includes('CONNECTION')) {
      return MobileErrorCategory.NETWORK;
    }
    
    if (code.includes('PERMISSION')) {
      return MobileErrorCategory.PERMISSION;
    }
    
    if (code.includes('TOKEN') || code.includes('QR')) {
      return MobileErrorCategory.QR_CODE;
    }
    
    if (code.includes('CALL') || code.includes('USER_OFFLINE')) {
      return MobileErrorCategory.CALL;
    }
    
    if (code.includes('AUTH') || code.includes('SESSION')) {
      return MobileErrorCategory.AUTHENTICATION;
    }
    
    return MobileErrorCategory.SYSTEM;
  }

  // Get user-friendly title for error category
  static getCategoryTitle(category: MobileErrorCategory): string {
    switch (category) {
      case MobileErrorCategory.NETWORK:
        return 'Connection Error';
      case MobileErrorCategory.PERMISSION:
        return 'Permission Required';
      case MobileErrorCategory.QR_CODE:
        return 'QR Code Error';
      case MobileErrorCategory.CALL:
        return 'Call Error';
      case MobileErrorCategory.AUTHENTICATION:
        return 'Authentication Error';
      case MobileErrorCategory.SYSTEM:
        return 'System Error';
      default:
        return 'Error';
    }
  }

  // Get suggested actions for error
  static getSuggestedActions(error: MobileError): string[] {
    const actions: string[] = [];

    switch (error.category) {
      case MobileErrorCategory.NETWORK:
        actions.push('Check your internet connection');
        actions.push('Try switching between WiFi and mobile data');
        if (error.retryable) {
          actions.push('Try again in a few moments');
        }
        break;

      case MobileErrorCategory.PERMISSION:
        actions.push('Go to Settings > Privacy & Security');
        actions.push('Enable the required permission');
        actions.push('Restart the app');
        break;

      case MobileErrorCategory.QR_CODE:
        actions.push('Ensure the QR code is clearly visible');
        actions.push('Ask for a new QR code if expired');
        actions.push('Make sure you have good lighting');
        break;

      case MobileErrorCategory.CALL:
        if (error.retryable) {
          actions.push('Try calling again');
          actions.push('Check your network connection');
        }
        actions.push('Ask the other person to check their connection');
        break;

      case MobileErrorCategory.AUTHENTICATION:
        actions.push('Check your login credentials');
        if (error.code === 'SESSION_EXPIRED') {
          actions.push('Log in again');
        }
        break;

      case MobileErrorCategory.SYSTEM:
        actions.push('Restart the app');
        actions.push('Check for app updates');
        if (error.retryable) {
          actions.push('Try again later');
        }
        break;
    }

    return actions;
  }

  // Check if error should show retry button
  static shouldShowRetry(error: MobileError): boolean {
    return error.retryable;
  }

  // Check if error should show settings button
  static shouldShowSettings(error: MobileError): boolean {
    return error.category === MobileErrorCategory.PERMISSION;
  }
}

// Utility functions
export function isNetworkError(error: MobileError): boolean {
  return error.category === MobileErrorCategory.NETWORK;
}

export function isPermissionError(error: MobileError): boolean {
  return error.category === MobileErrorCategory.PERMISSION;
}

export function isCriticalError(error: MobileError): boolean {
  return !error.retryable && error.category !== MobileErrorCategory.PERMISSION;
}