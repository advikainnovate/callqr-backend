/**
 * Database Connection Management
 * 
 * PostgreSQL connection management with encryption at rest,
 * connection pooling, and transaction management.
 * 
 * Requirements: 10.4, 10.5
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import crypto from 'crypto';

/**
 * Database configuration interface
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  encryptionKey?: string;
  enableQueryLogging?: boolean;
}

/**
 * Transaction callback interface
 */
export type TransactionCallback<T> = (client: PoolClient) => Promise<T>;

/**
 * Database connection manager
 */
export class DatabaseManager {
  private pool: Pool;
  private config: DatabaseConfig;
  private encryptionKey: Buffer | null = null;

  constructor(config: DatabaseConfig) {
    this.config = config;
    
    // Initialize encryption key if provided
    if (config.encryptionKey) {
      this.encryptionKey = Buffer.from(config.encryptionKey, 'hex');
    }

    // Create connection pool
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      max: config.maxConnections || 20,
      idleTimeoutMillis: config.idleTimeoutMs || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMs || 10000,
      ssl: config.ssl ? { rejectUnauthorized: false } : false
    };

    this.pool = new Pool(poolConfig);

    // Set up pool event handlers
    this.setupPoolEventHandlers();
  }

  /**
   * Get a client from the pool
   */
  async getClient(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();
      return client;
    } catch (error) {
      console.error('Failed to get database client:', error);
      throw new Error('Database connection failed');
    }
  }

  /**
   * Execute a query with automatic client management
   */
  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.getClient();
    try {
      if (this.config.enableQueryLogging) {
        console.log('Executing query:', text, params ? 'with params' : 'without params');
      }
      
      const result = await client.query(text, params);
      return result;
    } catch (error) {
      console.error('Query execution failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Encrypt sensitive data before storage
   */
  encrypt(data: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive data after retrieval
   */
  decrypt(encryptedData: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Hash sensitive data for storage (one-way)
   */
  hash(data: string, salt?: string): string {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(data, actualSalt, 10000, 64, 'sha512');
    return actualSalt + ':' + hash.toString('hex');
  }

  /**
   * Verify hashed data
   */
  verifyHash(data: string, hashedData: string): boolean {
    const parts = hashedData.split(':');
    if (parts.length !== 2) {
      return false;
    }

    const salt = parts[0];
    const hash = parts[1];
    
    const verifyHash = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512');
    return hash === verifyHash.toString('hex');
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW() as current_time');
      console.log('Database connection test successful:', result.rows[0]);
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    try {
      await this.pool.end();
      console.log('Database connection pool closed');
    } catch (error) {
      console.error('Error closing database connection pool:', error);
    }
  }

  /**
   * Set up pool event handlers
   */
  private setupPoolEventHandlers(): void {
    this.pool.on('connect', (client) => {
      if (this.config.enableQueryLogging) {
        console.log('New database client connected');
      }
    });

    this.pool.on('remove', (client) => {
      if (this.config.enableQueryLogging) {
        console.log('Database client removed from pool');
      }
    });

    this.pool.on('error', (err, client) => {
      console.error('Database pool error:', err);
    });

    // Handle process termination
    process.on('SIGINT', () => {
      this.close();
    });

    process.on('SIGTERM', () => {
      this.close();
    });
  }
}

/**
 * Database manager factory
 */
export class DatabaseManagerFactory {
  static create(config: DatabaseConfig): DatabaseManager {
    return new DatabaseManager(config);
  }

  static createFromEnv(): DatabaseManager {
    const config: DatabaseConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'privacy_qr_calling',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      ssl: process.env.DB_SSL === 'true',
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
      idleTimeoutMs: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMs: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
      encryptionKey: process.env.DB_ENCRYPTION_KEY,
      enableQueryLogging: process.env.DB_ENABLE_QUERY_LOGGING === 'true'
    };

    return new DatabaseManager(config);
  }
}

/**
 * Global database manager instance
 */
let globalDatabaseManager: DatabaseManager | null = null;

/**
 * Get global database manager instance
 */
export function getDatabaseManager(): DatabaseManager {
  if (!globalDatabaseManager) {
    globalDatabaseManager = DatabaseManagerFactory.createFromEnv();
  }
  return globalDatabaseManager;
}

/**
 * Initialize database manager with custom config
 */
export function initializeDatabaseManager(config: DatabaseConfig): DatabaseManager {
  globalDatabaseManager = new DatabaseManager(config);
  return globalDatabaseManager;
}