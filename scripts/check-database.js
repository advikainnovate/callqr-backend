const postgres = require('postgres');
require('dotenv').config();

async function checkDatabase() {
  const dbName = process.env.DB_NAME || 'qr_calling_db';
  const sql = postgres(process.env.DATABASE_URL || `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${dbName}`);

  try {
    console.log(`Checking database: ${dbName}`);
    
    // Check if our tables exist
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    console.log('\n📋 Existing tables:');
    if (tables.length === 0) {
      console.log('   No tables found - perfect for our QR calling system!');
    } else {
      tables.forEach(table => {
        console.log(`   - ${table.table_name}`);
      });
    }
    
    // Check if it's a clean database (only our expected tables or empty)
    const ourTables = ['users', 'qr_codes', 'calls', 'auth_session_tokens', 'examples'];
    const hasOtherTables = tables.some(table => !ourTables.includes(table.table_name));
    
    if (hasOtherTables) {
      console.log('\n⚠️  This database contains other application tables.');
      console.log('   You might want to use a different database name.');
    } else {
      console.log('\n✅ This database looks good for our QR calling system!');
    }
    
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
  } finally {
    await sql.end();
  }
}

checkDatabase();
