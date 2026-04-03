const postgres = require('postgres');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

// Encryption functions (matching user.service.ts)
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

async function addTestUsers() {
  try {
    console.log('🔄 Adding Test Users (Non-Destructive)...');

    // 1. Find Unassigned QR Codes
    const unassignedQRs = await sql`
      SELECT id, token, human_token 
      FROM qr_codes 
      WHERE status = 'unassigned' 
      LIMIT 2
    `;

    if (unassignedQRs.length < 2) {
      console.error('❌ Not enough unassigned QR codes found in the database.');
      console.log(
        '💡 Please generate more QR codes first or check your status column.'
      );
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash('password123', 10);
    const sharedPhone = '+918005936038';

    const usersToCreate = [
      {
        username: 'testuser_a',
        email: 'test_a@example.com',
        qr: unassignedQRs[0],
      },
      {
        username: 'testuser_b',
        email: 'test_b@example.com',
        qr: unassignedQRs[1],
      },
    ];

    for (const u of usersToCreate) {
      // Check if user already exists
      const existing =
        await sql`SELECT id FROM users WHERE username = ${u.username}`;

      let userId;
      if (existing.length > 0) {
        userId = existing[0].id;
        console.log(
          `ℹ️  User ${u.username} already exists. Skipping creation.`
        );
      } else {
        userId = uuidv4();
        const emailEnc = encryptData(u.email);
        const emailHash = hashData(u.email);
        const phoneEnc = encryptData(sharedPhone);
        const phoneHash = hashData(sharedPhone);

        // Create User
        await sql`
          INSERT INTO users (
            id, username, password_hash, email, email_hash, phone, phone_hash, 
            status, is_phone_verified, created_at, updated_at
          ) VALUES (
            ${userId}, ${u.username}, ${passwordHash}, ${emailEnc}, ${emailHash}, 
            ${phoneEnc}, ${phoneHash}, 'active', 'true', NOW(), NOW()
          )
        `;

        // Create Subscription
        await sql`
          INSERT INTO subscriptions (
            id, user_id, plan, status, started_at, created_at
          ) VALUES (
            ${uuidv4()}, ${userId}, 'free', 'active', NOW(), NOW()
          )
        `;
        console.log(`✅ Created user: ${u.username}`);
      }

      // Check if user already has a QR code
      const userQR =
        await sql`SELECT id FROM qr_codes WHERE assigned_user_id = ${userId}`;
      if (userQR.length > 0) {
        console.log(`ℹ️  User ${u.username} already has a QR code assigned.`);
      } else {
        // Assign the unassigned QR code
        await sql`
          UPDATE qr_codes 
          SET assigned_user_id = ${userId}, 
              status = 'active', 
              assigned_at = NOW() 
          WHERE id = ${u.qr.id}
        `;
        console.log(`✅ Assigned QR ${u.qr.human_token} to ${u.username}`);
      }
    }

    console.log('\n✨ Finished! Test users are ready.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

addTestUsers();
