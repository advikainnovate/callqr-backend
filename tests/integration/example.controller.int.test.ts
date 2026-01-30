import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/db';
import { examples } from '../../src/models/example.schema';

describe('Example Controller Integration', () => {
  let server: any;

  beforeAll(async () => {
    // Use the same server as in setup.ts
    // @ts-ignore
    server = global.server || app.listen(0);
  });

  afterAll(async () => {
    await db.delete(examples);
    if (server && server.close) server.close();
  });

  afterEach(async () => {
    await db.delete(examples);
  });

  describe('POST /api/examples', () => {
    it('should create a new example item', async () => {
      const exampleData = {
        name: 'Test Item',
        description: 'A test item',
        price: 99, // Changed to integer as per schema
        metadata: { category: 'electronics' },
      };
      const res = await request(server)
        .post('/api/examples')
        .send(exampleData)
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('Test Item');
    });

    it('should return 400 if required fields are missing', async () => {
      const res = await request(server)
        .post('/api/examples')
        .send({})
        .expect(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/examples', () => {
    it('should return a list of example items', async () => {
      await db.insert(examples).values([
        {
          name: 'Item 1',
          description: 'First',
          price: 10,
          metadata: { category: 'books', priority: 'medium', createdAt: new Date().toISOString() },
        },
        {
          name: 'Item 2',
          description: 'Second',
          price: 20,
          metadata: { category: 'electronics', priority: 'medium', createdAt: new Date().toISOString() },
        },
      ]);
      const res = await request(server).get('/api/examples').expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });
});

