const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

async function runManualMigration() {
  console.log('🚀 Starting manual migration patch...\n');

  const statements = [
    // 1. Create guest_identifiers if it doesn't exist
    `CREATE TABLE IF NOT EXISTS "guest_identifiers" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "fingerprint" text NOT NULL,
      "guest_id" uuid NOT NULL,
      "created_at" timestamp DEFAULT now(),
      "last_seen_at" timestamp DEFAULT now(),
      CONSTRAINT "guest_identifiers_fingerprint_unique" UNIQUE("fingerprint")
    )`,

    // 2. Add columns to users table (using DO block to ignore if already exists)
    `DO $$ 
     BEGIN 
       BEGIN ALTER TABLE "users" ADD COLUMN "normalized_email_hash" text; EXCEPTION WHEN duplicate_column THEN null; END;
       BEGIN ALTER TABLE "users" ADD COLUMN "emergency_contact" text DEFAULT '' NOT NULL; EXCEPTION WHEN duplicate_column THEN null; END;
       BEGIN ALTER TABLE "users" ADD COLUMN "email_verification_code" text; EXCEPTION WHEN duplicate_column THEN null; END;
       BEGIN ALTER TABLE "users" ADD COLUMN "email_verification_expires" timestamp; EXCEPTION WHEN duplicate_column THEN null; END;
       BEGIN ALTER TABLE "users" ADD COLUMN "is_email_verified" varchar(10) DEFAULT 'false' NOT NULL; EXCEPTION WHEN duplicate_column THEN null; END;
     END $$;`,

    // 3. Create indices if they don't exist
    `CREATE INDEX IF NOT EXISTS "guest_identifiers_fingerprint_idx" ON "guest_identifiers" ("fingerprint")`,
    `CREATE INDEX IF NOT EXISTS "users_email_verification_code_idx" ON "users" ("email_verification_code")`,
    `CREATE INDEX IF NOT EXISTS "users_normalized_email_hash_idx" ON "users" ("normalized_email_hash")`,
  ];

  for (const statement of statements) {
    try {
      await sql.unsafe(statement);
      console.log('✅ Executed statement successfully');
    } catch (err) {
      console.error('❌ Statement failed:', err.message);
    }
  }

  console.log(
    '\n✨ Manual migration patch completed. Now run the backfill script.'
  );
  await sql.end();
}

runManualMigration();
