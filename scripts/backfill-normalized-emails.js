const postgres = require('postgres');
const crypto = require('crypto');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

// Helper functions (same as in UserService)
function decryptData(encryptedData) {
  try {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    const parts = encryptedData.split(':');

    if (parts.length !== 2) return null;

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return null;
  }
}

function hashData(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function normalizeEmail(email) {
  email = email.trim().toLowerCase();
  const [local, domain] = email.split('@');

  // Gmail normalization
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const cleanLocal = local
      .split('+')[0] // remove alias
      .replace(/\./g, ''); // remove dots
    return `${cleanLocal}@gmail.com`;
  }

  // Other providers: remove only plus alias
  const cleanLocal = local.split('+')[0];
  return `${cleanLocal}@${domain}`;
}

async function backfill() {
  try {
    console.log('📝 Starting backfill for normalized_email_hash...\n');

    // Fetch all users with emails but without normalized_email_hash
    const users = await sql`
      SELECT id, email FROM users 
      WHERE email IS NOT NULL AND normalized_email_hash IS NULL
    `;

    console.log(`🔍 Found ${users.length} users to process.`);

    let successCount = 0;
    let failCount = 0;
    let duplicateCount = 0;
    const seenHashes = new Set();

    for (const user of users) {
      const originalEmail = decryptData(user.email);
      if (!originalEmail) {
        console.warn(`⚠️ Could not decrypt email for user ${user.id}`);
        failCount++;
        continue;
      }

      const normalized = normalizeEmail(originalEmail);
      const hash = hashData(normalized);

      // Check for duplicates within this batch
      if (seenHashes.has(hash)) {
        console.error(
          `❌ Duplicate normalized email found: ${normalized} (User ID: ${user.id})`
        );
        duplicateCount++;
        continue;
      }
      seenHashes.add(hash);

      try {
        await sql`
          UPDATE users 
          SET normalized_email_hash = ${hash} 
          WHERE id = ${user.id}
        `;
        successCount++;
        if (successCount % 10 === 0)
          console.log(`✅ Processed ${successCount} users...`);
      } catch (err) {
        console.error(`❌ Failed to update user ${user.id}:`, err.message);
        failCount++;
      }
    }

    console.log('\n🏁 Backfill completed!');
    console.log(`✅ Successfully updated: ${successCount}`);
    console.log(`❌ Failed updates:       ${failCount}`);
    console.log(`🚫 Duplicates skipped:   ${duplicateCount}`);

    if (duplicateCount > 0) {
      console.warn(
        '\n⚠️ WARNING: Some duplicate accounts were found. You must resolve these manually before applying the UNIQUE constraint migration.'
      );
    } else if (failCount === 0) {
      console.log('\n✨ All clear! You can now run the uniqueness migration.');
    }
  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
  } finally {
    await sql.end();
  }
}

backfill();
