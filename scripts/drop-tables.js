const postgres = require('postgres');
require('dotenv').config();

async function dropTables() {
  const sql = postgres(process.env.DATABASE_URL || `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'express_ts_db'}`);

  try {
    console.log('Connected to database');

    // Drop all tables in reverse order of dependencies
    const tables = [
      'calls',
      'qr_codes', 
      'auth_session_tokens',
      'examples',
      'users'
    ];

    for (const table of tables) {
      await sql`DROP TABLE IF EXISTS ${sql(table)} CASCADE`;
      console.log(`Dropped table: ${table}`);
    }

    // Drop migration table and schema
    await sql`DROP TABLE IF EXISTS "__drizzle_migrations" CASCADE`;
    console.log('Dropped migration table');

    await sql`DROP SCHEMA IF EXISTS "drizzle" CASCADE`;
    console.log('Dropped drizzle schema');

    console.log('All tables dropped successfully!');
  } catch (error) {
    console.error('Error dropping tables:', error);
  } finally {
    await sql.end();
  }
}

dropTables();
