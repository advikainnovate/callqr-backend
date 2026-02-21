import request from 'supertest';
import app from '../../src/app';
import { userService } from '../../src/services/user.service';
import { generateAccessToken } from '../../src/utils/jwt';

describe('Profile Endpoint Integration Tests', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Create a test user
    const user = await userService.createUser({
      username: `testuser_${Date.now()}`,
      password: 'password123',
      phone: '+1234567890',
      email: 'test@example.com',
    });

    userId = user.id;
    authToken = generateAccessToken({ userId: user.id, username: user.username });
  });

  describe('GET /auth/profile', () => {
    it('should return complete profile with all fields', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Profile retrieved successfully',
        data: {
          id: userId,
          username: expect.any(String),
          phone: expect.any(String),
          email: expect.any(String),
          status: 'active',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          subscription: {
            plan: expect.any(String),
            status: expect.any(String),
          },
          qrCodes: {
            total: expect.any(Number),
            active: expect.any(Number),
            codes: expect.any(Array),
          },
          usage: {
            calls: {
              today: expect.any(Number),
              limit: expect.any(Number),
              remaining: expect.any(Number),
            },
            messages: {
              today: expect.any(Number),
              limit: expect.anything(), // Can be number or "unlimited"
              remaining: expect.anything(),
            },
            chats: {
              active: expect.any(Number),
              limit: expect.anything(),
              remaining: expect.anything(),
            },
          },
        },
      });
    });

    it('should return 401 without authentication token', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
      });
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
      });
    });

    it('should have correct subscription for new user (FREE plan)', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.subscription.plan).toBe('FREE');
      expect(response.body.data.usage.calls.limit).toBe(20);
      expect(response.body.data.usage.messages.limit).toBe(100);
      expect(response.body.data.usage.chats.limit).toBe(5);
    });

    it('should have zero usage for new user', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.usage.calls.today).toBe(0);
      expect(response.body.data.usage.messages.today).toBe(0);
      expect(response.body.data.usage.chats.active).toBe(0);
    });

    it('should have correct remaining counts', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const { usage } = response.body.data;

      // For FREE plan
      expect(usage.calls.remaining).toBe(usage.calls.limit - usage.calls.today);
      expect(usage.messages.remaining).toBe(usage.messages.limit - usage.messages.today);
      expect(usage.chats.remaining).toBe(usage.chats.limit - usage.chats.active);
    });

    it('should include QR codes array (may be empty)', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data.qrCodes.codes)).toBe(true);
      expect(response.body.data.qrCodes.total).toBe(response.body.data.qrCodes.codes.length);
    });

    it('should have valid date formats', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const { createdAt, updatedAt } = response.body.data;

      // Should be valid ISO 8601 dates
      expect(new Date(createdAt).toISOString()).toBe(createdAt);
      expect(new Date(updatedAt).toISOString()).toBe(updatedAt);
    });

    it('should return decrypted phone and email', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Phone and email should be decrypted (not hashed)
      expect(response.body.data.phone).toBe('+1234567890');
      expect(response.body.data.email).toBe('test@example.com');
    });
  });

  describe('Profile Response Performance', () => {
    it('should respond within acceptable time', async () => {
      const startTime = Date.now();

      await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const duration = Date.now() - startTime;

      // Should respond within 500ms
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Profile Data Consistency', () => {
    it('should have consistent total and active QR code counts', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const { qrCodes } = response.body.data;
      const actualActive = qrCodes.codes.filter((qr: any) => qr.status === 'active').length;

      expect(qrCodes.active).toBe(actualActive);
      expect(qrCodes.total).toBe(qrCodes.codes.length);
    });

    it('should have non-negative remaining counts', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const { usage } = response.body.data;

      if (typeof usage.calls.remaining === 'number') {
        expect(usage.calls.remaining).toBeGreaterThanOrEqual(0);
      }

      if (typeof usage.messages.remaining === 'number') {
        expect(usage.messages.remaining).toBeGreaterThanOrEqual(0);
      }

      if (typeof usage.chats.remaining === 'number') {
        expect(usage.chats.remaining).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
