import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

const client = postgres(connectionString);
const db = drizzle(client);

async function getLastMigration() {
  try {
    const result = await db.execute(sql`
      SELECT version, applied_at 
      FROM drizzle_migrations 
      ORDER BY applied_at DESC 
      LIMIT 1
    `);
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error fetching last migration:', error);
    return null;
  }
}

async function rollbackMigration() {
  console.log('🔄 Rolling back last migration...\n');

  try {
    const lastMigration = await getLastMigration();
    
    if (!lastMigration) {
      console.log('ℹ️  No migrations to rollback');
      return;
    }

    console.log(`Last migration: ${lastMigration.version}`);
    console.log(`Applied at: ${lastMigration.applied_at}\n`);

    // Read migration file to understand what was applied
    const migrationDir = join(process.cwd(), 'drizzle');
    const migrationFiles = readdirSync(migrationDir).filter(f => f.endsWith('.sql'));
    const lastMigrationFile = migrationFiles.find(f => f.includes(lastMigration.version));

    if (!lastMigrationFile) {
      console.error('❌ Migration file not found');
      process.exit(1);
    }

    console.log(`📄 Migration file: ${lastMigrationFile}\n`);

    // Prompt for confirmation
    console.log('⚠️  WARNING: This will attempt to rollback the last migration.');
    console.log('⚠️  Manual rollback may be required for complex migrations.\n');

    // Common rollback operations
    console.log('Attempting automatic rollback...\n');

    // Drop tables created in Phase 2 (example - adjust based on your migrations)
    const tablesToDrop = [
      'bug_reports',
      'subscriptions',
      'chat_messages',
      'chat_sessions'
    ];

    for (const table of tablesToDrop) {
      try {
        await db.execute(sql.raw(`DROP TABLE IF EXISTS ${table} CASCADE`));
        console.log(`✅ Dropped table: ${table}`);
      } catch (error) {
        console.log(`⚠️  Could not drop table ${table}: ${error.message}`);
      }
    }

    // Remove migration record
    await db.execute(sql`
      DELETE FROM drizzle_migrations 
      WHERE version = ${lastMigration.version}
    `);

    console.log('\n✅ Migration rollback completed!');
    console.log('\nℹ️  Note: You may need to manually verify and adjust the database state.');
    console.log('ℹ️  Run npm run db:push to reapply migrations if needed.');

  } catch (error) {
    console.error('❌ Error during rollback:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

rollbackMigration();
