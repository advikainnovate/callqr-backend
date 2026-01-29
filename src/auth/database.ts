/**
 * Database Configuration and Connection Management
 * 
 * Handles database configuration and connection setup for authentication system.
 */

import { DatabaseConfig, PostgreSQLUserStorage } from './userStorage';

/**
 * Environment-based database configuration
 */
export function getDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'privacy_qr_calling',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000'),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000')
  };
}

/**
 * Creates and configures user storage instance
 */
export function createUserStorage(): PostgreSQLUserStorage {
  const config = getDatabaseConfig();
  return new PostgreSQLUserStorage(config);
}

/**
 * Database connection health check
 */
export async function checkDatabaseHealth(userStorage: PostgreSQLUserStorage): Promise<boolean> {
  try {
    return await userStorage.healthCheck();
  } catch (error) {
    console.error('Database health check error:', error);
    return false;
  }
}