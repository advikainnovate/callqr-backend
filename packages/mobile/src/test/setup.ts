/**
 * Jest test setup for mobile app
 * 
 * This file configures the testing environment for React Native components
 * and includes setup for both unit tests and property-based tests.
 */

// Mock react-native modules
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Mock QR code scanner
jest.mock('react-native-qrcode-scanner', () => 'QRCodeScanner');

// Mock WebRTC
jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
  mediaDevices: {
    getUserMedia: jest.fn(),
  },
}));

// Mock permissions
jest.mock('react-native-permissions', () => ({
  PERMISSIONS: {
    ANDROID: {
      CAMERA: 'android.permission.CAMERA',
      RECORD_AUDIO: 'android.permission.RECORD_AUDIO',
    },
    IOS: {
      CAMERA: 'ios.permission.CAMERA',
      MICROPHONE: 'ios.permission.MICROPHONE',
    },
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    BLOCKED: 'blocked',
  },
  request: jest.fn(),
  check: jest.fn(),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

// Mock Keychain
jest.mock('react-native-keychain', () => ({
  setInternetCredentials: jest.fn(),
  getInternetCredentials: jest.fn(),
  resetInternetCredentials: jest.fn(),
}));

// Global test timeout
jest.setTimeout(10000);

// Extend global namespace for test utilities
declare global {
  var testUtils: {
    generateTestQRData: () => string;
    generateTestSessionId: () => string;
  };
}

// Global test utilities
(global as any).testUtils = {
  // Utility functions for mobile tests will be added here
  generateTestQRData: () => 'test-qr-' + Math.random().toString(36).substr(2, 9),
  generateTestSessionId: () => 'test-session-' + Math.random().toString(36).substr(2, 9),
};

export {};