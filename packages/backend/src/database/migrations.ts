/**
 * Database Migrations
 * 
 * Database migration management for schema updates and data transformations.
 * Provides version control for database schema changes.
 * 
 * Requirements: 10.4, 10.5
 */

import { DatabaseManager } from './connection';
import fs from 'fs';
import path from 'path';

/**
 * Migration interface
 */
export interface Migration {
  version: string;
  name: string;
  up: string;
  down: string;
  timestamp: Date;
}

/**
 * Migration result interface
 */
export interface MigrationResult {
  success: boolean;
  version: string;
  name: string;
  error?: string;
  executionTime: number;
}

/**
 * Database migration manager
 */
export class MigrationManager {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * Initialize migration tracking table
   */
  async initializeMigrationTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
        execution_time_ms INTEGER,
        checksum VARCHAR(64)
      );
      
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at 
      ON schema_migrations(applied_at);
    `;

    await this.db.query(createTableQuery);
  }

  /**
   * Get applied migrations
   */
  async getAppliedMigrations(): Promise<string[]> {
    const result = await this.db.query(
      'SELECT version FROM schema_migrations ORDER BY applied_at ASC'
    );
    return result.rows.map((row: any) => row.version);
  }

  /**
   * Apply a single migration
   */
  async applyMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      await this.db.transaction(async (client) => {
        // Execute migration SQL
        await client.query(migration.up);

        // Record migration in tracking table
        const checksum = this.calculateChecksum(migration.up);
        await client.query(
          `INSERT INTO schema_migrations (version, name, applied_at, execution_time_ms, checksum)
           VALUES ($1, $2, NOW(), $3, $4)`,
          [migration.version, migration.name, Date.now() - startTime, checksum]
        );
      });

      return {
        success: true,
        version: migration.version,
        name: migration.name,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      console.error(`Migration ${migration.version} failed:`, error);
      return {
        success: false,
        version: migration.version,
        name: migration.name,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Rollback a migration
   */
  async rollbackMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      await this.db.transaction(async (client) => {
        // Execute rollback SQL
        await client.query(migration.down);

        // Remove migration from tracking table
        await client.query(
          'DELETE FROM schema_migrations WHERE version = $1',
          [migration.version]
        );
      });

      return {
        success: true,
        version: migration.version,
        name: migration.name,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      console.error(`Rollback ${migration.version} failed:`, error);
      return {
        success: false,
        version: migration.version,
        name: migration.name,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(migrations: Migration[]): Promise<MigrationResult[]> {
    await this.initializeMigrationTable();
    
    const appliedMigrations = await this.getAppliedMigrations();
    const pendingMigrations = migrations.filter(
      migration => !appliedMigrations.includes(migration.version)
    );

    console.log(`Found ${pendingMigrations.length} pending migrations`);

    const results: MigrationResult[] = [];

    for (const migration of pendingMigrations) {
      console.log(`Applying migration ${migration.version}: ${migration.name}`);
      const result = await this.applyMigration(migration);
      results.push(result);

      if (!result.success) {
        console.error(`Migration failed, stopping at ${migration.version}`);
        break;
      }
    }

    return results;
  }

  /**
   * Load migrations from directory
   */
  loadMigrationsFromDirectory(migrationDir: string): Migration[] {
    const migrations: Migration[] = [];

    if (!fs.existsSync(migrationDir)) {
      console.warn(`Migration directory ${migrationDir} does not exist`);
      return migrations;
    }

    const files = fs.readdirSync(migrationDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const filePath = path.join(migrationDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Parse migration file
      const migration = this.parseMigrationFile(file, content);
      if (migration) {
        migrations.push(migration);
      }
    }

    return migrations;
  }

  /**
   * Parse migration file content
   */
  private parseMigrationFile(filename: string, content: string): Migration | null {
    try {
      // Extract version from filename (e.g., "001_initial_schema.sql" -> "001")
      const versionMatch = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!versionMatch) {
        console.warn(`Invalid migration filename format: ${filename}`);
        return null;
      }

      const version = versionMatch[1];
      const name = versionMatch[2].replace(/_/g, ' ');

      // Split content into up and down sections
      const sections = content.split('-- DOWN');
      const up = sections[0].replace(/^-- UP\s*\n?/m, '').trim();
      const down = sections[1] ? sections[1].trim() : '';

      return {
        version,
        name,
        up,
        down,
        timestamp: new Date()
      };
    } catch (error) {
      console.error(`Error parsing migration file ${filename}:`, error);
      return null;
    }
  }

  /**
   * Calculate checksum for migration content
   */
  private calculateChecksum(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<{
    appliedCount: number;
    appliedMigrations: string[];
    lastMigration?: { version: string; name: string; appliedAt: Date };
  }> {
    try {
      const result = await this.db.query(`
        SELECT version, name, applied_at 
        FROM schema_migrations 
        ORDER BY applied_at DESC 
        LIMIT 1
      `);

      const appliedMigrations = await this.getAppliedMigrations();

      return {
        appliedCount: appliedMigrations.length,
        appliedMigrations,
        lastMigration: result.rows[0] ? {
          version: result.rows[0].version,
          name: result.rows[0].name,
          appliedAt: result.rows[0].applied_at
        } : undefined
      };
    } catch (error) {
      console.error('Error getting migration status:', error);
      return {
        appliedCount: 0,
        appliedMigrations: []
      };
    }
  }
}

/**
 * Built-in migrations
 */
export const INITIAL_MIGRATIONS: Migration[] = [
  {
    version: '001',
    name: 'Initial Schema',
    up: fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'),
    down: `
      DROP TABLE IF EXISTS security_audit_log CASCADE;
      DROP TABLE IF EXISTS rate_limits CASCADE;
      DROP TABLE IF EXISTS mfa_secrets CASCADE;
      DROP TABLE IF EXISTS user_sessions CASCADE;
      DROP TABLE IF EXISTS call_sessions CASCADE;
      DROP TABLE IF EXISTS token_mappings CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
      DROP FUNCTION IF EXISTS cleanup_expired_tokens() CASCADE;
      DROP FUNCTION IF EXISTS cleanup_expired_sessions() CASCADE;
      DROP FUNCTION IF EXISTS cleanup_old_call_sessions() CASCADE;
      DROP FUNCTION IF EXISTS cleanup_old_rate_limits() CASCADE;
      DROP FUNCTION IF EXISTS cleanup_old_audit_logs() CASCADE;
      DROP FUNCTION IF EXISTS perform_database_cleanup() CASCADE;
    `,
    timestamp: new Date('2024-01-01T00:00:00Z')
  }
];

/**
 * Migration runner utility
 */
export class MigrationRunner {
  static async runInitialMigrations(db: DatabaseManager): Promise<void> {
    const migrationManager = new MigrationManager(db);
    
    console.log('Running initial database migrations...');
    const results = await migrationManager.runMigrations(INITIAL_MIGRATIONS);
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`Migration results: ${successful} successful, ${failed} failed`);
    
    if (failed > 0) {
      const failedMigrations = results.filter(r => !r.success);
      console.error('Failed migrations:', failedMigrations);
      throw new Error('Some migrations failed');
    }
  }

  static async runMigrationsFromDirectory(
    db: DatabaseManager, 
    migrationDir: string
  ): Promise<void> {
    const migrationManager = new MigrationManager(db);
    const migrations = migrationManager.loadMigrationsFromDirectory(migrationDir);
    
    if (migrations.length === 0) {
      console.log('No migrations found');
      return;
    }
    
    console.log(`Running ${migrations.length} migrations from ${migrationDir}...`);
    const results = await migrationManager.runMigrations(migrations);
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`Migration results: ${successful} successful, ${failed} failed`);
    
    if (failed > 0) {
      throw new Error('Some migrations failed');
    }
  }
}