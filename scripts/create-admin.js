const postgres = require('postgres');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

// Encryption functions (same as in user.service.ts)
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

async function createAdmin() {
  try {
    console.log('🔧 Admin User Creation Script\n');

    // Get user input
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (query) => new Promise((resolve) => readline.question(query, resolve));

    const username = await question('Enter admin username: ');
    const password = await question('Enter admin password (min 6 chars): ');
    const email = await question('Enter admin email (optional, press Enter to skip): ');
    const phone = await question('Enter admin phone (optional, press Enter to skip): ');

    readline.close();

    // Validate input
    if (!username || username.length < 3) {
      console.error('❌ Username must be at least 3 characters');
      process.exit(1);
    }

    if (!password || password.length < 6) {
      console.error('❌ Password must be at least 6 characters');
      process.exit(1);
    }

    console.log('\n📝 Creating admin user...');

    // Check if username already exists
    const existingUser = await sql`
      SELECT id FROM users WHERE username = ${username}
    `;

    if (existingUser.length > 0) {
      console.error(`❌ Username "${username}" already exists`);
      console.log(`\n💡 To make this user an admin, add their ID to .env:`);
      console.log(`   User ID: ${existingUser[0].id}`);
      console.log(`   ADMIN_USER_IDS=${existingUser[0].id}`);
      process.exit(1);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Encrypt and hash email/phone if provided
    const emailEncrypted = email ? encryptData(email) : null;
    const emailHash = email ? hashData(email) : null;
    const phoneEncrypted = phone ? encryptData(phone) : null;
    const phoneHash = phone ? hashData(phone) : null;

    // Create user
    const userId = uuidv4();
    await sql`
      INSERT INTO users (
        id, username, password_hash, email, email_hash, phone, phone_hash, 
        status, is_phone_verified, created_at, updated_at
      ) VALUES (
        ${userId}, ${username}, ${passwordHash}, ${emailEncrypted}, ${emailHash}, 
        ${phoneEncrypted}, ${phoneHash}, 'active', 'true', NOW(), NOW()
      )
    `;

    // Create FREE subscription for the user
    const subscriptionId = uuidv4();
    await sql`
      INSERT INTO subscriptions (
        id, user_id, plan, status, started_at, created_at
      ) VALUES (
        ${subscriptionId}, ${userId}, 'free', 'active', NOW(), NOW()
      )
    `;

    console.log('\n✅ Admin user created successfully!\n');
    console.log('📋 User Details:');
    console.log(`   Username: ${username}`);
    console.log(`   User ID:  ${userId}`);
    console.log(`   Status:   active`);
    console.log(`   Phone Verified: true (automatically set for admin)`);
    console.log(`   Plan:     free`);
    console.log(`   Email:    ${email || 'not provided (optional for admin)'}`);
    console.log(`   Phone:    ${phone || 'not provided (optional for admin)'}`);

    console.log('\n🔐 Next Steps:');
    console.log('1. Add this user ID to your .env file:');
    console.log(`   ADMIN_USER_IDS=${userId}`);
    console.log('\n   If you have multiple admins, separate with commas:');
    console.log(`   ADMIN_USER_IDS=${userId},other-admin-id`);
    console.log('\n2. Restart your server');
    console.log('\n3. Login with:');
    console.log(`   Username: ${username}`);
    console.log(`   Password: [the password you entered]`);
    console.log('\n4. Test admin access:');
    console.log(`   GET /api/admin/users`);
    console.log('\n💡 Note: Admin users bypass phone verification requirements!');

  } catch (error) {
    console.error('\n❌ Error creating admin user:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure PostgreSQL is running and DATABASE_URL is correct in .env');
    } else if (error.code === '23505') {
      console.log('\n💡 Username already exists. Choose a different username.');
    }
    
    process.exit(1);
  } finally {
    await sql.end();
  }
}

createAdmin();
