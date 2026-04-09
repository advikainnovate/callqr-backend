import dotenv from 'dotenv';
import app from '../src/app';
import { IncomingMessage, Server, ServerResponse } from 'http';
import { client } from '../src/db';

dotenv.config();

export let server: Server<
  typeof IncomingMessage,
  typeof ServerResponse
> | null = null;

beforeAll(async () => {
  try {
    // Database connection is handled lazily by Drizzle/Postgres.js
    // We might want to ensure migrations are applied here if using a test DB
    server = app.listen(0); // random available port
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

  // Close database connection after the server is shut down.
  await client.end({ timeout: 5 });
});
