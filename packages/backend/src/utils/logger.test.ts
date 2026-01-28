/**
 * Unit tests for privacy-compliant logger
 * 
 * These tests verify that the logger properly sanitizes sensitive information
 * while maintaining useful diagnostic capabilities.
 */

import { logger, LogLevel } from './logger';

describe('PrivacyLogger', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    // Set log level to DEBUG to ensure all messages are logged during tests
    logger.setLogLevel(LogLevel.DEBUG);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('sensitive data sanitization', () => {
    it('should hash sensitive field values', () => {
      logger.info('Test message', {
        token: 'secret-token-123',
        userId: 'user-456',
        normalField: 'normal-value'
      });

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('Test message');
      expect(logCall).toContain('[HASH:');
      expect(logCall).not.toContain('secret-token-123');
      expect(logCall).not.toContain('user-456');
      expect(logCall).toContain('normal-value');
    });

    it('should redact empty sensitive fields', () => {
      logger.info('Test message', {
        password: '',
        secret: null,
        normalField: 'normal-value'
      });

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('[REDACTED]');
      expect(logCall).toContain('normal-value');
    });

    it('should handle context without sensitive fields', () => {
      logger.info('Test message', {
        status: 'active',
        count: 42,
        timestamp: new Date().toISOString()
      });

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('active');
      expect(logCall).toContain('42');
      expect(logCall).not.toContain('[HASH:');
      expect(logCall).not.toContain('[REDACTED]');
    });
  });

  describe('log levels', () => {
    it('should log error messages', () => {
      logger.error('Error message');
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/ERROR: Error message/)
      );
    });

    it('should log warning messages', () => {
      logger.warn('Warning message');
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/WARN: Warning message/)
      );
    });

    it('should log info messages', () => {
      logger.info('Info message');
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/INFO: Info message/)
      );
    });

    it('should include timestamp in log output', () => {
      logger.info('Test message');
      
      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });
  });

  describe('context handling', () => {
    it('should handle undefined context', () => {
      logger.info('Message without context');
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/INFO: Message without context$/)
      );
    });

    it('should include sanitized context in log output', () => {
      logger.info('Message with context', { 
        requestId: 'req-123',
        operation: 'test'
      });
      
      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('req-123');
      expect(logCall).toContain('test');
    });
  });
});