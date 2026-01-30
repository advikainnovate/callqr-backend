const postgres = require('postgres');
require('dotenv').config();

async function createDatabase() {
  // Connect to postgres database (default database) to create our new database
  const sql = postgres(process.env.DATABASE_URL || `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/postgres`);

  try {
    console.log('Connected to postgres database');
    
    // Create our new database
    const dbName = process.env.DB_NAME || 'qr_calling_db';
    await sql`CREATE DATABASE ${sql(dbName)}`;
    console.log(`✅ Database '${dbName}' created successfully!`);
    
    console.log('\n📝 Update your .env file with:');
    console.log(`DB_NAME=${dbName}`);
    console.log(`DATABASE_URL=postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${dbName}`);
    
  } catch (error) {
    if (error.code === '42P04') {
      console.log('⚠️  Database already exists');
    } else {
      console.error('❌ Error creating database:', error);
    }
  } finally {
    await sql.end();
  }
}

createDatabase();
