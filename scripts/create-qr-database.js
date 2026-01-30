const postgres = require('postgres');
require('dotenv').config();

async function createQRDatabase() {
  // Connect to postgres database (default database) to create our new database
  const sql = postgres(process.env.DATABASE_URL || `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/postgres`);

  try {
    console.log('Connected to postgres database');
    
    // Create our new database specifically for QR calling
    const dbName = 'qr_calling_system';
    await sql`CREATE DATABASE ${sql(dbName)}`;
    console.log(`✅ Database '${dbName}' created successfully!`);
    
    console.log('\n📝 Update your .env file with:');
    console.log(`DB_NAME=${dbName}`);
    console.log(`DATABASE_URL=postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${dbName}`);
    
    console.log('\n🔄 Then run: npm run db:push');
    
  } catch (error) {
    if (error.code === '42P04') {
      console.log('⚠️  Database already exists, you can use it!');
      console.log('\n📝 Make sure your .env file has:');
      console.log(`DB_NAME=${dbName}`);
      console.log(`DATABASE_URL=postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${dbName}`);
    } else {
      console.error('❌ Error creating database:', error);
    }
  } finally {
    await sql.end();
  }
}

createQRDatabase();
