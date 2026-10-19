-- Client demo change #6: RFI/RFA reply link (no login).
-- ADDITIVE ONLY: one new table and new nullable columns. Nothing existing is dropped, renamed or retyped.
CREATE TABLE IF NOT EXISTS "design_request_reply_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "design_request_reply_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "design_request_reply_tokens_recipient_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "design_request_recipients"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_request_reply_tokens_recipient_idx" ON "design_request_reply_tokens" ("recipient_id");
--> statement-breakpoint
ALTER TABLE "design_request_recipients" ADD COLUMN IF NOT EXISTS "response_text" text;
--> statement-breakpoint
ALTER TABLE "design_request_recipients" ADD COLUMN IF NOT EXISTS "responder_name" varchar(100);
--> statement-breakpoint
ALTER TABLE "design_request_recipients" ADD COLUMN IF NOT EXISTS "responder_position" varchar(100);
--> statement-breakpoint
ALTER TABLE "design_request_files" ADD COLUMN IF NOT EXISTS "recipient_id" integer;
--> statement-breakpoint
ALTER TABLE "design_requests" ADD COLUMN IF NOT EXISTS "responded_by_position" varchar(100);
