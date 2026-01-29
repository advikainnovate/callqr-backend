/**
 * User Storage Implementation
 * 
 * PostgreSQL implementation of user storage for authentication system.
 */

import { Pool, PoolClient } from 'pg';
import { UserCredentials, AuthenticationError } from './types';
import { UserId } from '../utils/types';
import { UserStorage, UserProfileData } from './authService';

/**
 * Database configuration
 */
export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly username: string;
  readonly password: string;
  readonly ssl?: boolean;
  readonly maxConnections?: number;
  readonly connectionTimeoutMillis?: number;
  readonly idleTimeoutMillis?: number;
}

/**
 * PostgreSQL User Storage implementation
 */
export class PostgreSQLUserStorage implements UserStorage {
  private readonly pool: Pool;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl,
      max: config.maxConnections || 20,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 5000,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err);
    });
  }

  /**
   * Creates a new user in the database
   */
  async createUser(credentials: UserCredentials): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if user already exists
      const existingUser = await client.query(
        'SELECT user_id FROM users WHERE auth_hash = $1',
        [credentials.email] // Using email as unique identifier
      );

      if (existingUser.rows.length > 0) {
        throw new Error(AuthenticationError.EMAIL_ALREADY_EXISTS);
      }

      // Insert new user
      await client.query(`
        INSERT INTO users (
          user_id, 
          auth_hash, 
          password_hash,
          salt,
          mfa_secret,
          mfa_enabled,
          created_at, 
          last_login,
          failed_login_attempts,
          locked_until,
          is_active,
          emergency_contact,
          vehicle_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        credentials.userId,
        credentials.email, // Store email in auth_hash field for lookup
        credentials.passwordHash,
        credentials.salt,
        credentials.mfaSecret || null,
        credentials.mfaEnabled,
        credentials.createdAt,
        credentials.lastLogin || null,
        credentials.failedLoginAttempts,
        null, // locked_until
        true, // is_active
        null, // emergency_contact (will be added in task 4.2)
        null  // vehicle_number (will be added in task 4.2)
      ]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating user:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves user by email
   */
  async getUserByEmail(email: string): Promise<UserCredentials | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          user_id,
          auth_hash as email,
          password_hash,
          salt,
          mfa_secret,
          mfa_enabled,
          created_at,
          last_login,
          failed_login_attempts,
          locked_until
        FROM users 
        WHERE auth_hash = $1 AND is_active = true
      `, [email]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        userId: row.user_id as UserId,
        email: row.email,
        passwordHash: row.password_hash,
        salt: row.salt,
        mfaSecret: row.mfa_secret,
        mfaEnabled: row.mfa_enabled,
        createdAt: row.created_at,
        lastLogin: row.last_login,
        failedLoginAttempts: row.failed_login_attempts,
        lockedUntil: row.locked_until
      };
    } catch (error) {
      console.error('Error getting user by email:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves user by ID
   */
  async getUserById(userId: UserId): Promise<UserCredentials | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          user_id,
          auth_hash as email,
          password_hash,
          salt,
          mfa_secret,
          mfa_enabled,
          created_at,
          last_login,
          failed_login_attempts,
          locked_until
        FROM users 
        WHERE user_id = $1 AND is_active = true
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        userId: row.user_id as UserId,
        email: row.email,
        passwordHash: row.password_hash,
        salt: row.salt,
        mfaSecret: row.mfa_secret,
        mfaEnabled: row.mfa_enabled,
        createdAt: row.created_at,
        lastLogin: row.last_login,
        failedLoginAttempts: row.failed_login_attempts,
        lockedUntil: row.locked_until
      };
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Updates user information
   */
  async updateUser(userId: UserId, updates: Partial<UserCredentials>): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // Build dynamic update query
      if (updates.passwordHash !== undefined) {
        updateFields.push(`password_hash = $${paramIndex++}`);
        values.push(updates.passwordHash);
      }
      if (updates.salt !== undefined) {
        updateFields.push(`salt = $${paramIndex++}`);
        values.push(updates.salt);
      }
      if (updates.mfaSecret !== undefined) {
        updateFields.push(`mfa_secret = $${paramIndex++}`);
        values.push(updates.mfaSecret);
      }
      if (updates.mfaEnabled !== undefined) {
        updateFields.push(`mfa_enabled = $${paramIndex++}`);
        values.push(updates.mfaEnabled);
      }
      if (updates.lastLogin !== undefined) {
        updateFields.push(`last_login = $${paramIndex++}`);
        values.push(updates.lastLogin);
      }

      if (updateFields.length === 0) {
        return; // Nothing to update
      }

      values.push(userId);
      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')} 
        WHERE user_id = $${paramIndex}
      `;

      await client.query(query, values);
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Updates login attempt tracking
   */
  async updateLoginAttempts(userId: UserId, attempts: number, lockedUntil?: Date): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        UPDATE users 
        SET failed_login_attempts = $1, locked_until = $2
        WHERE user_id = $3
      `, [attempts, lockedUntil || null, userId]);
    } catch (error) {
      console.error('Error updating login attempts:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Updates user profile with privacy fields
   */
  async updateUserProfile(userId: UserId, profileData: UserProfileData): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (profileData.emergencyContact !== undefined) {
        updateFields.push(`emergency_contact = $${paramIndex++}`);
        values.push(profileData.emergencyContact);
      }
      
      if (profileData.vehicleNumber !== undefined) {
        updateFields.push(`vehicle_number = $${paramIndex++}`);
        values.push(profileData.vehicleNumber);
      }

      if (updateFields.length === 0) {
        return; // Nothing to update
      }

      values.push(userId);
      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')} 
        WHERE user_id = $${paramIndex}
      `;

      await client.query(query, values);
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Gets user profile data
   */
  async getUserProfile(userId: UserId): Promise<UserProfileData | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT emergency_contact, vehicle_number
        FROM users 
        WHERE user_id = $1 AND is_active = true
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        emergencyContact: row.emergency_contact,
        vehicleNumber: row.vehicle_number
      };
    } catch (error) {
      console.error('Error getting user profile:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Closes the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Health check for database connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}