const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

async function enforceUniqueness() {
  console.log('🔒 Enforcing uniqueness constraints...\n');

  const statements = [
    `ALTER TABLE "users" ADD CONSTRAINT "users_phone_hash_unique" UNIQUE("phone_hash")`,
    `ALTER TABLE "users" ADD CONSTRAINT "users_email_hash_unique" UNIQUE("email_hash")`,
    `ALTER TABLE "users" ADD CONSTRAINT "users_normalized_email_hash_unique" UNIQUE("normalized_email_hash")`,
  ];

  for (const statement of statements) {
    try {
      await sql.unsafe(statement);
      console.log('✅ Constraint added successfully');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('ℹ️ Constraint already exists, skipping.');
      } else {
        console.error('❌ Failed to add constraint:', err.message);
        console.log(
          '💡 Tip: This usually fails if you have duplicate data. Run the backfill script first!'
        );
      }
    }
  }

  console.log('\n✨ All uniqueness constraints have been applied!');
  await sql.end();
}

enforceUniqueness();
