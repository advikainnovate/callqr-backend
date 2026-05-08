CREATE TABLE "guest_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"guest_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"last_seen_at" timestamp DEFAULT now(),
	CONSTRAINT "guest_identifiers_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "normalized_email_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emergency_contact" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verification_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verification_expires" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_email_verified" varchar(10) DEFAULT 'false' NOT NULL;--> statement-breakpoint
CREATE INDEX "guest_identifiers_fingerprint_idx" ON "guest_identifiers" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "users_email_verification_code_idx" ON "users" USING btree ("email_verification_code");--> statement-breakpoint
CREATE INDEX "users_normalized_email_hash_idx" ON "users" USING btree ("normalized_email_hash");