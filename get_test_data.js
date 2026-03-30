const postgres = require('postgres');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;

const sql = postgres(DATABASE_URL);

async function main() {
  try {
    const rows = await sql`
      SELECT 
        qr.token, 
        qr.id as "qrCodeId", 
        qr.assigned_user_id as "userId", 
        u.username 
      FROM qr_codes qr 
      JOIN users u ON qr.assigned_user_id = u.id 
      WHERE qr.status = 'active' 
      LIMIT 1
    `;
    if (rows.length === 0) {
      console.log('null');
    } else {
      console.log(JSON.stringify(rows[0]));
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
