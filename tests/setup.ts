import dotenv from 'dotenv';
import { IncomingMessage, Server, ServerResponse } from 'http';

dotenv.config();

// By default we avoid starting the express server and opening a DB
// connection during unit tests. Set `START_SERVER=true` in the
// environment when you want the full app/server and DB to start
// (for integration tests).
export let server: Server<
  typeof IncomingMessage,
  typeof ServerResponse
> | null = null;

beforeAll(async () => {
  if (process.env.START_SERVER !== 'true') return;

  try {
    // Lazy import to avoid initializing the app/db during unit tests
    const app = (await import('../src/app')).default;
    const { client } = await import('../src/db');

    // Start server on random port
    server = app.listen(0);
    // Store client on global for teardown
    (global as any).__TEST_DB_CLIENT = client;
  } catch (error) {
    console.error('Error starting server:', error);
    throw error;
  }
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    server = null;
  }

  // Close database connection only if we started it
  const client = (global as any).__TEST_DB_CLIENT;
  if (client && typeof client.end === 'function') {
    await client.end({ timeout: 5 });
    (global as any).__TEST_DB_CLIENT = null;
  }
});
