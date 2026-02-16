import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';

config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

const client = postgres(connectionString);
const db = drizzle(client);

async function addConstraints() {
  console.log('🔄 Adding unique constraints...\n');

  try {
    // Users table constraints
    console.log('Adding constraints to users table...');
    await db.execute(sql`ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS unique_email UNIQUE (email)`);
    await db.execute(sql`ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS unique_username UNIQUE (username)`);

    // QR codes table constraints
    console.log('Adding constraints to qr_codes table...');
    await db.execute(sql`ALTER TABLE qr_codes ADD CONSTRAINT IF NOT EXISTS unique_qr_code UNIQUE (code)`);

    // Chat sessions table constraints
    console.log('Adding constraints to chat_sessions table...');
    await db.execute(sql`
      ALTER TABLE chat_sessions 
      ADD CONSTRAINT IF NOT EXISTS unique_chat_session 
      UNIQUE (user1_id, user2_id)
    `);

    // Subscriptions table constraints
    console.log('Adding constraints to subscriptions table...');
    await db.execute(sql`
      ALTER TABLE subscriptions 
      ADD CONSTRAINT IF NOT EXISTS check_dates 
      CHECK (end_date > start_date)
    `);

    // Calls table constraints
    console.log('Adding constraints to calls table...');
    await db.execute(sql`
      ALTER TABLE calls 
      ADD CONSTRAINT IF NOT EXISTS check_call_duration 
      CHECK (duration >= 0)
    `);
    await db.execute(sql`
      ALTER TABLE calls 
      ADD CONSTRAINT IF NOT EXISTS check_different_users 
      CHECK (caller_id != receiver_id)
    `);

    // Chat messages table constraints
    console.log('Adding constraints to chat_messages table...');
    await db.execute(sql`
      ALTER TABLE chat_messages 
      ADD CONSTRAINT IF NOT EXISTS check_message_content 
      CHECK (char_length(content) > 0)
    `);

    console.log('\n✅ All constraints added successfully!');
  } catch (error) {
    console.error('❌ Error adding constraints:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addConstraints();
