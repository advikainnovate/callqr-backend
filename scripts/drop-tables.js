const postgres = require('postgres');
require('dotenv').config();

async function dropTables() {
  const sql = postgres(
    process.env.DATABASE_URL ||
      `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'express_ts_db'}`
  );

  try {
    console.log('Connected to database');

    // Drop all tables in reverse order of dependencies (CASCADE handles the rest)
    const tables = [
      'messages',
      'chat_sessions',
      'call_sessions',
      'payments',
      'subscriptions',
      'qr_codes',
      'user_blocks',
      'blocked_guests',
      'device_tokens',
      'guest_identifiers',
      'reports',
      'bug_reports',
      'users',
    ];

    for (const table of tables) {
      await sql.unsafe(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      console.log(`Dropped table: ${table}`);
    }

    // Drop migration table and schema
    await sql.unsafe(`DROP TABLE IF EXISTS "__drizzle_migrations" CASCADE`);
    await sql.unsafe(`DROP TABLE IF EXISTS "drizzle_migrations" CASCADE`);
    console.log('Dropped migration tables');

    await sql.unsafe(`DROP SCHEMA IF EXISTS "drizzle" CASCADE`);
    console.log('Dropped drizzle schema');

    console.log('All tables and metadata dropped successfully!');
  } catch (error) {
    console.error('Error dropping tables:', error);
  } finally {
    await sql.end();
  }
}

dropTables();
