const postgres = require('postgres');
require('dotenv').config();

async function checkTables() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  const sql = postgres(connectionString);

  try {
    console.log('🔍 Checking database tables...');
    
    // Check if tables exist
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    console.log('\n📋 Available tables:');
    tables.forEach(table => {
      console.log(`  ✅ ${table.table_name}`);
    });

    // Check if our required tables exist
    const requiredTables = ['users', 'qr_codes', 'calls', 'auth_session_tokens', 'examples'];
    const existingTableNames = tables.map(t => t.table_name);
    
    console.log('\n🔍 Table Status:');
    requiredTables.forEach(table => {
      const exists = existingTableNames.includes(table);
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    });

    // Test a simple query on qr_codes table
    if (existingTableNames.includes('qr_codes')) {
      const qrCount = await sql`SELECT COUNT(*) as count FROM qr_codes`;
      console.log(`\n📊 QR Codes table has ${qrCount[0].count} records`);
    }

    // Test a simple query on users table
    if (existingTableNames.includes('users')) {
      const userCount = await sql`SELECT COUNT(*) as count FROM users`;
      console.log(`👥 Users table has ${userCount[0].count} records`);
    }

  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await sql.end();
  }
}

checkTables();
