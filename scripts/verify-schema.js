const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

async function verifySchema() {
  try {
    console.log('📊 Verifying Database Schema...\n');
    
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    console.log('✅ Tables Created:');
    tables.forEach(t => console.log(`   ✓ ${t.table_name}`));
    
    console.log('\n📋 Checking Table Structures:\n');
    
    for (const table of tables) {
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = ${table.table_name}
        ORDER BY ordinal_position
      `;
      
      console.log(`${table.table_name}:`);
      columns.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? '(nullable)' : '';
        console.log(`   - ${col.column_name}: ${col.data_type} ${nullable}`);
      });
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sql.end();
  }
}

verifySchema();
