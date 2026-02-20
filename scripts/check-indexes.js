const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

async function checkIndexes() {
  console.log('📊 Checking Database Indexes...\n');

  const indexes = await sql`
    SELECT 
      tablename, 
      indexname,
      indexdef
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    ORDER BY tablename, indexname
  `;

  const grouped = {};
  indexes.forEach(idx => {
    if (!grouped[idx.tablename]) {
      grouped[idx.tablename] = [];
    }
    grouped[idx.tablename].push(idx.indexname);
  });

  Object.keys(grouped).sort().forEach(table => {
    console.log(`✅ ${table}:`);
    grouped[table].forEach(idx => {
      console.log(`   - ${idx}`);
    });
    console.log('');
  });

  await sql.end();
}

checkIndexes().catch(console.error);
