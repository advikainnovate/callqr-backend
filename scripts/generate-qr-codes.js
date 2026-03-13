/**
 * Script to bulk generate QR codes
 * Usage: node scripts/generate-qr-codes.js [count]
 * Example: node scripts/generate-qr-codes.js 100
 */

const { db } = require('../dist/db');
const { qrCodes } = require('../dist/models');
const { eq } = require('drizzle-orm');
const crypto = require('crypto');

function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateHumanToken() {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let token = 'QR-';

  for (let i = 0; i < 4; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  token += '-';

  for (let i = 0; i < 4; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return token;
}

async function checkHumanTokenExists(humanToken) {
  const result = await db
    .select()
    .from(qrCodes)
    .where(eq(qrCodes.humanToken, humanToken))
    .limit(1);

  return result.length > 0;
}

async function generateUniqueHumanToken() {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const humanToken = generateHumanToken();
    const exists = await checkHumanTokenExists(humanToken);

    if (!exists) {
      return humanToken;
    }

    attempts++;
  }

  throw new Error('Failed to generate unique human token');
}

async function generateQRCodes(count) {
  console.log(`Generating ${count} QR codes...`);

  const qrCodeData = [];

  for (let i = 0; i < count; i++) {
    const token = generateSecureToken();
    const humanToken = await generateUniqueHumanToken();

    qrCodeData.push({
      token,
      humanToken,
      status: 'unassigned',
    });

    if ((i + 1) % 10 === 0) {
      console.log(`Generated ${i + 1}/${count} QR codes...`);
    }
  }

  console.log('Inserting QR codes into database...');

  const inserted = await db.insert(qrCodes).values(qrCodeData).returning();

  console.log(`\n✅ Successfully generated ${inserted.length} QR codes!`);
  console.log('\nSample QR codes:');

  inserted.slice(0, 5).forEach((qr, index) => {
    console.log(`${index + 1}. ${qr.humanToken} (ID: ${qr.id})`);
  });

  if (inserted.length > 5) {
    console.log(`... and ${inserted.length - 5} more`);
  }

  return inserted;
}

async function main() {
  const count = parseInt(process.argv[2]) || 10;

  if (count < 1 || count > 1000) {
    console.error('❌ Count must be between 1 and 1000');
    process.exit(1);
  }

  try {
    await generateQRCodes(count);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating QR codes:', error);
    process.exit(1);
  }
}

main();
