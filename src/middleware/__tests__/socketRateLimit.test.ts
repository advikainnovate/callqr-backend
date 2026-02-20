import { SocketRateLimiter, ConnectionRateLimiter, rateLimitProfiles } from '../socketRateLimit';
import { Socket } from 'socket.io';

describe('SocketRateLimiter', () => {
  let rateLimiter: SocketRateLimiter;

  beforeEach(() => {
    rateLimiter = new SocketRateLimiter();
  });

  afterEach(() => {
    rateLimiter.destroy();
  });

  it('should allow requests within limit', async () => {
    const mockSocket = { userId: 'user1', id: 'socket1', emit: jest.fn() } as unknown as Socket & { userId?: string };
    const limiter = rateLimiter.createLimiter('test-event', {
      windowMs: 60000,
      maxRequests: 5,
    });

    // Should allow first 5 requests
    for (let i = 0; i < 5; i++) {
      await new Promise<void>((resolve, reject) => {
        limiter(mockSocket, {}, (err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('should block requests exceeding limit', async () => {
    const mockSocket = { userId: 'user1', id: 'socket1', emit: jest.fn() } as unknown as Socket & { userId?: string };
    const limiter = rateLimiter.createLimiter('test-event', {
      windowMs: 60000,
      maxRequests: 3,
      message: 'Too many requests',
    });

    // Allow first 3 requests
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve) => {
        limiter(mockSocket, {}, () => resolve());
      });
    }

    // 4th request should be blocked
    await new Promise<void>((resolve) => {
      limiter(mockSocket, {}, (err?: Error) => {
        expect(err).toBeDefined();
        expect(err?.message).toBe('Rate limit exceeded');
        resolve();
      });
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('rate-limit-exceeded', expect.objectContaining({
      event: 'test-event',
      message: 'Too many requests',
    }));
  });

  it('should reset after time window expires', async () => {
    const mockSocket = { userId: 'user1', id: 'socket1', emit: jest.fn() } as unknown as Socket & { userId?: string };
    const limiter = rateLimiter.createLimiter('test-event', {
      windowMs: 100, // 100ms window
      maxRequests: 2,
    });

    // Use up the limit
    for (let i = 0; i < 2; i++) {
      await new Promise<void>((resolve) => {
        limiter(mockSocket, {}, () => resolve());
      });
    }

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should allow requests again
    await new Promise<void>((resolve, reject) => {
      limiter(mockSocket, {}, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it('should track limits per user', async () => {
    const mockSocket1 = { userId: 'user1', id: 'socket1', emit: jest.fn() } as unknown as Socket & { userId?: string };
    const mockSocket2 = { userId: 'user2', id: 'socket2', emit: jest.fn() } as unknown as Socket & { userId?: string };
    const limiter = rateLimiter.createLimiter('test-event', {
      windowMs: 60000,
      maxRequests: 2,
    });

    // User 1 uses up their limit
    for (let i = 0; i < 2; i++) {
      await new Promise<void>((resolve) => {
        limiter(mockSocket1, {}, () => resolve());
      });
    }

    // User 2 should still be able to make requests
    await new Promise<void>((resolve, reject) => {
      limiter(mockSocket2, {}, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    expect(mockSocket2.emit).not.toHaveBeenCalled();
  });

  it('should reset limits for specific user', async () => {
    const mockSocket = { userId: 'user1', id: 'socket1', emit: jest.fn() } as unknown as Socket & { userId?: string };
    const limiter = rateLimiter.createLimiter('test-event', {
      windowMs: 60000,
      maxRequests: 2,
    });

    // Use up the limit
    for (let i = 0; i < 2; i++) {
      await new Promise<void>((resolve) => {
        limiter(mockSocket, {}, () => resolve());
      });
    }

    // Reset limits
    rateLimiter.reset('user1', 'test-event');

    // Should allow requests again
    await new Promise<void>((resolve, reject) => {
      limiter(mockSocket, {}, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
});

describe('ConnectionRateLimiter', () => {
  let connectionLimiter: ConnectionRateLimiter;

  beforeEach(() => {
    connectionLimiter = new ConnectionRateLimiter(3, 60000); // 3 connections per minute
  });

  afterEach(() => {
    connectionLimiter.destroy();
  });

  it('should allow connections within limit', () => {
    const result1 = connectionLimiter.allowConnection('192.168.1.1');
    const result2 = connectionLimiter.allowConnection('192.168.1.1');
    const result3 = connectionLimiter.allowConnection('192.168.1.1');

    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    expect(result3.allowed).toBe(true);
  });

  it('should block connections exceeding limit', () => {
    // Use up the limit
    for (let i = 0; i < 3; i++) {
      connectionLimiter.allowConnection('192.168.1.1');
    }

    // 4th connection should be blocked
    const result = connectionLimiter.allowConnection('192.168.1.1');
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('should track limits per IP', () => {
    // Use up limit for IP 1
    for (let i = 0; i < 3; i++) {
      connectionLimiter.allowConnection('192.168.1.1');
    }

    // IP 2 should still be allowed
    const result = connectionLimiter.allowConnection('192.168.1.2');
    expect(result.allowed).toBe(true);
  });

  it('should reset after time window', async () => {
    const limiter = new ConnectionRateLimiter(2, 100); // 2 connections per 100ms

    // Use up the limit
    limiter.allowConnection('192.168.1.1');
    limiter.allowConnection('192.168.1.1');

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should allow connections again
    const result = limiter.allowConnection('192.168.1.1');
    expect(result.allowed).toBe(true);

    limiter.destroy();
  });
});

describe('rateLimitProfiles', () => {
  it('should have all required profiles', () => {
    expect(rateLimitProfiles.signaling).toBeDefined();
    expect(rateLimitProfiles.callAction).toBeDefined();
    expect(rateLimitProfiles.chatMessage).toBeDefined();
    expect(rateLimitProfiles.typing).toBeDefined();
    expect(rateLimitProfiles.chatRoom).toBeDefined();
    expect(rateLimitProfiles.readReceipt).toBeDefined();
  });

  it('should have reasonable limits', () => {
    // Signaling should allow more requests (WebRTC needs many ICE candidates)
    expect(rateLimitProfiles.signaling.maxRequests).toBeGreaterThan(50);

    // Chat messages should be moderate
    expect(rateLimitProfiles.chatMessage.maxRequests).toBeGreaterThan(10);
    expect(rateLimitProfiles.chatMessage.maxRequests).toBeLessThan(100);

    // Call actions should be strict
    expect(rateLimitProfiles.callAction.maxRequests).toBeLessThan(30);
  });
});
