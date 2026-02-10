const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

async function cleanup() {
  try {
    await sql`DROP TABLE IF EXISTS auth_session_tokens CASCADE`;
    console.log('✅ Removed auth_session_tokens table');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sql.end();
  }
}

cleanup();
