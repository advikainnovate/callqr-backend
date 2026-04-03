const { Client } = require('pg');

const databaseUrl = 'postgres://postgres:1234@localhost:5432/qr_calling_db';
const userId = '3f795f8f-896e-4597-b2b3-d700fe0e7053';

async function checkUser() {
  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    const res = await client.query(
      'SELECT id, username, status FROM users WHERE id = $1',
      [userId]
    );

    if (res.rows.length > 0) {
      console.log('User found:', res.rows[0]);
    } else {
      console.log('User NOT found in database.');

      // List last 5 users to see what's in there
      const lastUsers = await client.query(
        'SELECT id, username FROM users ORDER BY created_at DESC LIMIT 5'
      );
      console.log('Last 5 users in DB:', lastUsers.rows);
    }
  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await client.end();
  }
}

checkUser();
