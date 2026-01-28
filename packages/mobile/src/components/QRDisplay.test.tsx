/**
 * Simple unit test for mobile app setup
 * 
 * This test verifies basic functionality without complex dependencies.
 */

describe('Mobile App Setup', () => {
  it('should have access to test utilities', () => {
    expect(global.testUtils).toBeDefined();
    expect(typeof global.testUtils.generateTestQRData).toBe('function');
    expect(typeof global.testUtils.generateTestSessionId).toBe('function');
  });

  it('should generate test data correctly', () => {
    const qrData = global.testUtils.generateTestQRData();
    const sessionId = global.testUtils.generateTestSessionId();
    
    expect(qrData).toMatch(/^test-qr-/);
    expect(sessionId).toMatch(/^test-session-/);
    expect(qrData).not.toBe(global.testUtils.generateTestQRData()); // Should be unique
  });

  it('should have React Native environment configured', () => {
    // Basic test to ensure Jest is working with React Native setup
    expect(process.env.NODE_ENV).toBe('test');
  });
});