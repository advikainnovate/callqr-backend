CREATE TABLE "qr_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_number" varchar(50) NOT NULL,
	"purpose" varchar(20) NOT NULL,
	"status" varchar(30) NOT NULL,
	"quantity" integer NOT NULL,
	"created_by" uuid,
	"notes" text,
	"print_job_ref" varchar(100),
	"distributed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "qr_batches_batch_number_unique" UNIQUE("batch_number")
);
--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "qr_batches" ADD CONSTRAINT "qr_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qr_batches_batch_number_idx" ON "qr_batches" USING btree ("batch_number");--> statement-breakpoint
CREATE INDEX "qr_batches_purpose_idx" ON "qr_batches" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "qr_batches_status_idx" ON "qr_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "qr_batches_created_by_idx" ON "qr_batches" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_batch_id_qr_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."qr_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qr_codes_batch_id_idx" ON "qr_codes" USING btree ("batch_id");