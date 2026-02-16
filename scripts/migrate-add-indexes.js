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

async function addIndexes() {
  console.log('🔄 Adding database indexes...\n');

  try {
    // Users table indexes
    console.log('Adding indexes to users table...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)`);

    // QR codes table indexes
    console.log('Adding indexes to qr_codes table...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_qr_codes_code ON qr_codes(code)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_qr_codes_user_id ON qr_codes(user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_qr_codes_status ON qr_codes(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_qr_codes_created_at ON qr_codes(created_at)`);

    // Calls table indexes
    console.log('Adding indexes to calls table...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_calls_caller_id ON calls(caller_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_calls_receiver_id ON calls(receiver_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_calls_started_at ON calls(started_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_calls_ended_at ON calls(ended_at)`);

    // Chat sessions table indexes
    console.log('Adding indexes to chat_sessions table...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_user1_id ON chat_sessions(user1_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_user2_id ON chat_sessions(user2_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_started_at ON chat_sessions(started_at)`);

    // Chat messages table indexes
    console.log('Adding indexes to chat_messages table...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_sent_at ON chat_messages(sent_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_is_read ON chat_messages(is_read)`);

    // Subscriptions table indexes
    console.log('Adding indexes to subscriptions table...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_type ON subscriptions(plan_type)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_start_date ON subscriptions(start_date)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON subscriptions(end_date)`);

    // Bug reports table indexes
    console.log('Adding indexes to bug_reports table...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON bug_reports(user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bug_reports_severity ON bug_reports(severity)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at)`);

    console.log('\n✅ All indexes added successfully!');
  } catch (error) {
    console.error('❌ Error adding indexes:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addIndexes();
