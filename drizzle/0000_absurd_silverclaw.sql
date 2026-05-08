CREATE TABLE "call_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caller_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"qr_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'initiated' NOT NULL,
	"ended_reason" varchar(50),
	"initiated_at" timestamp DEFAULT now(),
	"started_at" timestamp,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qr_id" uuid NOT NULL,
	"participant1_id" uuid NOT NULL,
	"participant2_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"device_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "device_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_session_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"message_type" varchar(20) DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"media_attachments" json,
	"is_delivered" boolean DEFAULT false,
	"is_read" boolean DEFAULT false,
	"is_deleted" boolean DEFAULT false,
	"sent_at" timestamp DEFAULT now(),
	"delivered_at" timestamp,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"razorpay_order_id" varchar(255) NOT NULL,
	"razorpay_payment_id" varchar(255),
	"razorpay_signature" varchar(255),
	"amount" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"plan" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'created' NOT NULL,
	"receipt" varchar(255),
	"notes" text,
	"error_code" varchar(100),
	"error_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_razorpay_order_id_unique" UNIQUE("razorpay_order_id"),
	CONSTRAINT "payments_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id")
);
--> statement-breakpoint
CREATE TABLE "qr_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(255) NOT NULL,
	"human_token" varchar(20) NOT NULL,
	"assigned_user_id" uuid,
	"status" varchar(20) DEFAULT 'unassigned' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"assigned_at" timestamp,
	CONSTRAINT "qr_codes_token_unique" UNIQUE("token"),
	CONSTRAINT "qr_codes_human_token_unique" UNIQUE("human_token")
);
--> statement-breakpoint
CREATE TABLE "bug_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"description" text NOT NULL,
	"severity" varchar(20) DEFAULT 'medium' NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" varchar(20) DEFAULT 'free' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"phone" text,
	"email" text,
	"phone_hash" text,
	"email_hash" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"reset_password_token" text,
	"reset_password_expires" timestamp,
	"phone_verification_code" text,
	"phone_verification_expires" timestamp,
	"is_phone_verified" varchar(10) DEFAULT 'false' NOT NULL,
	"is_globally_blocked" varchar(10) DEFAULT 'false' NOT NULL,
	"global_block_reason" text,
	"global_blocked_at" timestamp,
	"global_blocked_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"reason" varchar(100),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_user_block" UNIQUE("blocker_id","blocked_user_id")
);
--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_caller_id_users_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_qr_id_qr_codes_id_fk" FOREIGN KEY ("qr_id") REFERENCES "public"."qr_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_qr_id_qr_codes_id_fk" FOREIGN KEY ("qr_id") REFERENCES "public"."qr_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_participant1_id_users_id_fk" FOREIGN KEY ("participant1_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_participant2_id_users_id_fk" FOREIGN KEY ("participant2_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_sessions_status_idx" ON "call_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "call_sessions_started_at_idx" ON "call_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "call_sessions_caller_id_idx" ON "call_sessions" USING btree ("caller_id");--> statement-breakpoint
CREATE INDEX "call_sessions_receiver_id_idx" ON "call_sessions" USING btree ("receiver_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_status_idx" ON "chat_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chat_sessions_participant1_id_idx" ON "chat_sessions" USING btree ("participant1_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_participant2_id_idx" ON "chat_sessions" USING btree ("participant2_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_last_message_at_idx" ON "chat_sessions" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_tokens_token_idx" ON "device_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "messages_chat_session_id_idx" ON "messages" USING btree ("chat_session_id");--> statement-breakpoint
CREATE INDEX "messages_sender_id_idx" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "messages_is_delivered_idx" ON "messages" USING btree ("is_delivered");--> statement-breakpoint
CREATE INDEX "messages_is_read_idx" ON "messages" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "messages_sent_at_idx" ON "messages" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "messages_message_type_idx" ON "messages" USING btree ("message_type");--> statement-breakpoint
CREATE INDEX "payments_user_id_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_razorpay_order_id_idx" ON "payments" USING btree ("razorpay_order_id");--> statement-breakpoint
CREATE INDEX "payments_razorpay_payment_id_idx" ON "payments" USING btree ("razorpay_payment_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_created_at_idx" ON "payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "qr_codes_token_idx" ON "qr_codes" USING btree ("token");--> statement-breakpoint
CREATE INDEX "qr_codes_human_token_idx" ON "qr_codes" USING btree ("human_token");--> statement-breakpoint
CREATE INDEX "qr_codes_assigned_user_id_idx" ON "qr_codes" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "qr_codes_status_idx" ON "qr_codes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bug_reports_user_id_idx" ON "bug_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bug_reports_status_idx" ON "bug_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bug_reports_severity_idx" ON "bug_reports" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_reset_password_token_idx" ON "users" USING btree ("reset_password_token");--> statement-breakpoint
CREATE INDEX "users_is_globally_blocked_idx" ON "users" USING btree ("is_globally_blocked");--> statement-breakpoint
CREATE INDEX "user_blocks_blocker_id_idx" ON "user_blocks" USING btree ("blocker_id");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_user_id_idx" ON "user_blocks" USING btree ("blocked_user_id");