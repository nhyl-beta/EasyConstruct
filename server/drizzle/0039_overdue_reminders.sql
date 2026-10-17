-- Client demo change #8: overdue emails.
-- ADDITIVE ONLY: one new boolean column with a safe default (everyone starts opted in, as the client asked)
-- and one new table that remembers which overdue alerts were already sent. Nothing existing is changed.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_overdue_reminders" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "overdue_reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_type" varchar(20) NOT NULL,
	"item_id" integer NOT NULL,
	"recipient_user_id" integer NOT NULL,
	"channel" varchar(10) NOT NULL,
	"sent_on" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "overdue_reminders_once_uq" ON "overdue_reminders" ("item_type","item_id","recipient_user_id","channel","sent_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "overdue_reminders_item_idx" ON "overdue_reminders" ("item_type","item_id");
