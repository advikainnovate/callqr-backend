const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

async function resetDatabase() {
  try {
    console.log('🗑️  Dropping old tables...');
    
    // Drop tables in correct order (respecting foreign key constraints)
    await sql`DROP TABLE IF EXISTS calls CASCADE`;
    await sql`DROP TABLE IF EXISTS reports CASCADE`;
    await sql`DROP TABLE IF EXISTS auth_session_tokens CASCADE`;
    await sql`DROP TABLE IF EXISTS qr_codes CASCADE`;
    await sql`DROP TABLE IF EXISTS subscriptions CASCADE`;
    await sql`DROP TABLE IF EXISTS users CASCADE`;
    
    console.log('✅ Old tables dropped successfully');
    console.log('');
    console.log('📝 Now run: npm run db:push');
    console.log('   This will create the new schema tables');
    
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

resetDatabase();
