const postgres = require('postgres');
require('dotenv').config();
const sql = postgres(process.env.DATABASE_URL);

async function listUsers() {
  try {
    const users = await sql`SELECT id, username FROM users`;
    console.log('Current Test Users:');
    console.log(JSON.stringify(users, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

listUsers();
