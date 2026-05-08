CREATE TABLE "blocked_guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"guest_id" text,
	"ip_address" text,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "call_sessions" ALTER COLUMN "caller_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "guest_id" varchar(100);--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "guest_ip" varchar(50);--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "caller_type" varchar(20) DEFAULT 'registered' NOT NULL;--> statement-breakpoint
ALTER TABLE "blocked_guests" ADD CONSTRAINT "blocked_guests_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocked_guests_owner_id_idx" ON "blocked_guests" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "blocked_guests_guest_id_idx" ON "blocked_guests" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "blocked_guests_ip_address_idx" ON "blocked_guests" USING btree ("ip_address");