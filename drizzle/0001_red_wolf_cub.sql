ALTER TABLE "examples" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "examples" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_no" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emergency_no" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "vehicle_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_tier" text DEFAULT 'free';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_no_unique" UNIQUE("phone_no");