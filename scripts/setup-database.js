const postgres = require('postgres');
require('dotenv').config();

async function createDatabase() {
  // Default database name
  const dbName = process.env.DB_NAME || 'qr_calling_system';
  
  // First connect to default postgres database to check/create our target database
  const postgresSql = postgres(`postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/postgres`);

  try {
    console.log(`Checking if database '${dbName}' exists...`);
    
    // Check if database exists
    const result = await postgresSql`
      SELECT 1 FROM pg_database WHERE datname = ${postgresSql(dbName)}
    `;
    
    if (result.length > 0) {
      console.log(`✅ Database '${dbName}' already exists!`);
    } else {
      // Create the database
      await postgresSql`CREATE DATABASE ${postgresSql(dbName)}`;
      console.log(`✅ Database '${dbName}' created successfully!`);
    }
    
    console.log('\n📝 Your .env file should have:');
    console.log(`DB_NAME=${dbName}`);
    console.log(`DATABASE_URL=postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${dbName}`);
    
    console.log('\n🔄 Next steps:');
    console.log('1. Update your .env file with the DATABASE_URL above');
    console.log('2. Run: npm run db:push');
    console.log('3. Run: npm run db:migrate');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Make sure PostgreSQL is running and you have correct credentials in .env');
  } finally {
    await postgresSql.end();
  }
}

createDatabase();
