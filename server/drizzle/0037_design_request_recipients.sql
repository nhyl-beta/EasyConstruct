-- Client demo change #5: send one RFI/RFA to several stakeholders.
-- ADDITIVE ONLY: one new table. design_requests.recipient_email / email_status stay and are kept filled
-- from the first recipient. Requests sent before this existed get their recipient row the first time they
-- are opened or resent (done by the app, idempotent), not by this migration.
CREATE TABLE IF NOT EXISTS "design_request_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"stakeholder_id" integer,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_status" varchar(10) DEFAULT 'not_sent' NOT NULL,
	"sent_at" timestamp,
	"resend_count" integer DEFAULT 0 NOT NULL,
	"replied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "design_request_recipients_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "design_requests"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_request_recipients_request_idx" ON "design_request_recipients" ("request_id");
