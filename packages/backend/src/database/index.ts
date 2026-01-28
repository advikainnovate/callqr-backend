/**
 * Database Module Index
 * 
 * Central export for all database-related functionality including
 * connection management, migrations, and utilities.
 * 
 * Requirements: 10.4, 10.5
 */

// Connection management
export {
  DatabaseManager,
  DatabaseManagerFactory,
  getDatabaseManager,
  initializeDatabaseManager,
  type DatabaseConfig,
  type TransactionCallback
} from './connection';

// Migration management
export {
  MigrationManager,
  MigrationRunner,
  INITIAL_MIGRATIONS,
  type Migration,
  type MigrationResult
} from './migrations';

// Database utilities
export * from './utils';

/**
 * Initialize database with default configuration
 */
export async function initializeDatabase(): Promise<import('./connection').DatabaseManager> {
  const { DatabaseManagerFactory } = await import('./connection');
  const { MigrationRunner } = await import('./migrations');
  
  const db = DatabaseManagerFactory.createFromEnv();
  
  // Test connection
  const isConnected = await db.testConnection();
  if (!isConnected) {
    throw new Error('Failed to connect to database');
  }
  
  // Run initial migrations
  try {
    await MigrationRunner.runInitialMigrations(db);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
  
  return db;
}

/**
 * Database health check
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  poolStats?: any;
  migrationStatus?: any;
  error?: string;
}> {
  try {
    const { getDatabaseManager } = await import('./connection');
    const { MigrationManager } = await import('./migrations');
    const db = getDatabaseManager();
    
    const connected = await db.testConnection();
    if (!connected) {
      return { connected: false, error: 'Connection test failed' };
    }
    
    const poolStats = db.getPoolStats();
    
    const migrationManager = new MigrationManager(db);
    const migrationStatus = await migrationManager.getMigrationStatus();
    
    return {
      connected: true,
      poolStats,
      migrationStatus
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}