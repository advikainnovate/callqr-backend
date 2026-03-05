const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

async function resetDatabase() {
  try {
    console.log('🗑️  Dropping all tables and data...');
    
    // Drop all tables with CASCADE to handle all foreign keys
    await sql`DROP TABLE IF EXISTS messages CASCADE`;
    await sql`DROP TABLE IF EXISTS chat_sessions CASCADE`;
    await sql`DROP TABLE IF EXISTS call_sessions CASCADE`;
    await sql`DROP TABLE IF EXISTS calls CASCADE`;
    await sql`DROP TABLE IF EXISTS payments CASCADE`;
    await sql`DROP TABLE IF EXISTS bug_reports CASCADE`;
    await sql`DROP TABLE IF EXISTS reports CASCADE`;
    await sql`DROP TABLE IF EXISTS subscriptions CASCADE`;
    await sql`DROP TABLE IF EXISTS qr_codes CASCADE`;
    await sql`DROP TABLE IF EXISTS users CASCADE`;
    await sql`DROP TABLE IF EXISTS auth_session_tokens CASCADE`;
    
    console.log('✅ All tables dropped successfully');
    console.log('');
    console.log('📝 Now run: npm run db:push');
    console.log('   This will create fresh tables with the new schema');
    
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

resetDatabase();
