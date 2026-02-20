import { WebRTCService } from '../webrtc.service';
import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import { appConfig } from '../../config';

describe('WebRTC Service Graceful Shutdown', () => {
  let httpServer: any;
  let webrtcService: WebRTCService;
  const PORT = 3001;

  // Mock user service
  jest.mock('../../services/user.service', () => ({
    userService: {
      getUserById: jest.fn().mockResolvedValue({
        id: 'test-user-1',
        username: 'testuser',
        status: 'active',
      }),
    },
  }));

  beforeEach((done) => {
    // Create HTTP server
    httpServer = createServer();
    
    // Initialize WebRTC service
    webrtcService = new WebRTCService(httpServer);
    
    // Start server
    httpServer.listen(PORT, () => {
      done();
    });
  });

  afterEach(async () => {
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  });

  it('should have shutdown method', () => {
    expect(webrtcService.shutdown).toBeDefined();
    expect(typeof webrtcService.shutdown).toBe('function');
  });

  it('should clear internal state during shutdown', async () => {
    // Verify state is cleared
    await webrtcService.shutdown('Test shutdown');
    
    const statsAfter = webrtcService.getStats();
    expect(statsAfter.connectedUsers).toBe(0);
  });

  it('should complete shutdown within reasonable time', async () => {
    const startTime = Date.now();
    await webrtcService.shutdown('Test shutdown');
    const duration = Date.now() - startTime;

    // Should complete in less than 5 seconds
    expect(duration).toBeLessThan(5000);
  });

  it('should handle shutdown with no connected clients', async () => {
    const statsBefore = webrtcService.getStats();
    expect(statsBefore.connectedUsers).toBe(0);

    // Should not throw
    await expect(webrtcService.shutdown('Test shutdown')).resolves.not.toThrow();
  });

  it('should accept custom shutdown reason', async () => {
    const customReason = 'Scheduled maintenance';
    
    // Should not throw with custom reason
    await expect(webrtcService.shutdown(customReason)).resolves.not.toThrow();
  });

  it('should have getStats method', () => {
    const stats = webrtcService.getStats();
    
    expect(stats).toBeDefined();
    expect(stats.connectedUsers).toBeDefined();
    expect(stats.users).toBeDefined();
    expect(Array.isArray(stats.users)).toBe(true);
  });
});

describe('Server Graceful Shutdown Integration', () => {
  it('should handle SIGTERM signal', () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // This would normally trigger graceful shutdown
    // In tests, we just verify the handler is registered
    const listeners = process.listeners('SIGTERM');
    expect(listeners.length).toBeGreaterThan(0);

    mockExit.mockRestore();
  });

  it('should handle SIGINT signal', () => {
    const listeners = process.listeners('SIGINT');
    expect(listeners.length).toBeGreaterThan(0);
  });

  it('should handle uncaught exceptions', () => {
    const listeners = process.listeners('uncaughtException');
    expect(listeners.length).toBeGreaterThan(0);
  });

  it('should handle unhandled rejections', () => {
    const listeners = process.listeners('unhandledRejection');
    expect(listeners.length).toBeGreaterThan(0);
  });
});
