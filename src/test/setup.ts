/**
 * Jest test setup for backend services
 * 
 * This file configures the testing environment for both unit tests and property-based tests.
 */

import * as dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port for tests

// Global test timeout
jest.setTimeout(10000);

// Mock console methods in tests to reduce noise
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress console output during tests unless explicitly needed
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  // Restore console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Extend global namespace for test utilities
declare global {
  var testUtils: {
    generateTestToken: () => string;
    generateTestUserId: () => string;
  };
}

// Global test utilities
(global as any).testUtils = {
  // Utility functions for tests will be added here
  generateTestToken: () => 'test-token-' + Math.random().toString(36).substr(2, 9),
  generateTestUserId: () => 'test-user-' + Math.random().toString(36).substr(2, 9),
};