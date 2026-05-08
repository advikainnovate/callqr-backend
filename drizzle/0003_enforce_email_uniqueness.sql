ALTER TABLE "users" ADD CONSTRAINT "users_phone_hash_unique" UNIQUE("phone_hash");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_hash_unique" UNIQUE("email_hash");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_normalized_email_hash_unique" UNIQUE("normalized_email_hash");