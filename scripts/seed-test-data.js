const postgres = require('postgres');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

// Encryption functions
function encryptData(data) {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function hashData(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateHumanToken() {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let token = 'QR-';
  for (let i = 0; i < 4; i++)
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  token += '-';
  for (let i = 0; i < 4; i++)
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}

async function seed() {
  try {
    console.log('🔄 Seeding Test Data...');

    // 1. Drop existing data safely
    console.log('🧹 Cleaning existing users and data...');
    await sql`DELETE FROM messages`;
    await sql`DELETE FROM chat_sessions`;
    await sql`DELETE FROM call_sessions`;
    await sql`DELETE FROM qr_codes`;
    await sql`DELETE FROM subscriptions`;
    await sql`DELETE FROM users`;

    const passwordHash = await bcrypt.hash('password123', 10);
    const sharedPhone = '+918005936038';

    const users = [
      {
        id: uuidv4(),
        username: 'testuser_a',
        email: 'test_a@example.com',
        phone: sharedPhone,
      },
      {
        id: uuidv4(),
        username: 'testuser_b',
        email: 'test_b@example.com',
        phone: sharedPhone,
      },
    ];

    console.log(
      `👤 Creating ${users.length} test users with phone: ${sharedPhone}...`
    );

    for (const u of users) {
      const emailEnc = encryptData(u.email);
      const emailHash = hashData(u.email);
      const phoneEnc = encryptData(u.phone);
      const phoneHash = hashData(u.phone);

      // Create User
      await sql`
        INSERT INTO users (
          id, username, password_hash, email, email_hash, phone, phone_hash, 
          status, is_phone_verified, created_at, updated_at
        ) VALUES (
          ${u.id}, ${u.username}, ${passwordHash}, ${emailEnc}, ${emailHash}, 
          ${phoneEnc}, ${phoneHash}, 'active', 'true', NOW(), NOW()
        )
      `;

      // Create Subscription
      await sql`
        INSERT INTO subscriptions (
          id, user_id, plan, status, started_at, created_at
        ) VALUES (
          ${uuidv4()}, ${u.id}, 'free', 'active', NOW(), NOW()
        )
      `;

      // Create/Assign QR Code with VALID tokens
      const qrId = uuidv4();
      const qrToken = generateSecureToken();
      const humanToken = generateHumanToken();

      await sql`
        INSERT INTO qr_codes (
          id, token, human_token, assigned_user_id, status, assigned_at, created_at
        ) VALUES (
          ${qrId}, ${qrToken}, ${humanToken}, ${u.id}, 'active', NOW(), NOW()
        )
      `;

      u.qrToken = qrToken;
      u.humanToken = humanToken;
      console.log(`✅ Created ${u.username} (Human Token: ${humanToken})`);
    }

    console.log('\n✨ Seeding Complete!');
    console.log('--------------------------------------------------');
    console.log('User A: testuser_a / password123');
    console.log(`QR Token A (Full): ${users[0].qrToken}`);
    console.log(`Human Token A (Easy): ${users[0].humanToken}`);
    console.log('--------------------------------------------------');
    console.log('User B: testuser_b / password123');
    console.log(`QR Token B (Full): ${users[1].qrToken}`);
    console.log(`Human Token B (Easy): ${users[1].humanToken}`);
    console.log('--------------------------------------------------');
    console.log('Phone for both: +918005936038');
    console.log('--------------------------------------------------');
    console.log(
      'You can now log in with these credentials in the Test Client.'
    );
    console.log('💡 TIP: Use the "Human Token" for easy scanning.');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

seed();
