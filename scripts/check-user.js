const postgres = require('postgres');
require('dotenv').config();

async function checkUser() {
  const connectionString = process.env.DATABASE_URL;
  const hardcodedUserId = '123e4567-e89b-12d3-a456-426614174000';
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  const sql = postgres(connectionString);

  try {
    console.log(`🔍 Checking if user ${hardcodedUserId} exists...`);
    
    const user = await sql`
      SELECT id, email, is_active, created_at 
      FROM users 
      WHERE id = ${hardcodedUserId}
    `;
    
    if (user.length > 0) {
      console.log('✅ User found:');
      console.log(`  ID: ${user[0].id}`);
      console.log(`  Email: ${user[0].email}`);
      console.log(`  Active: ${user[0].is_active}`);
      console.log(`  Created: ${user[0].created_at}`);
    } else {
      console.log('❌ User not found!');
      console.log('This is likely causing the QR code creation to fail.');
      
      // Get all users to see what's available
      const allUsers = await sql`SELECT id, email FROM users`;
      console.log('\n📋 Available users:');
      allUsers.forEach(u => {
        console.log(`  ${u.id} - ${u.email}`);
      });
    }

  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await sql.end();
  }
}

checkUser();
