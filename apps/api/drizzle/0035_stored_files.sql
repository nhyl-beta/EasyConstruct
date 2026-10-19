-- Client demo change #2: corrupted-file check.
-- ADDITIVE ONLY: one new table. No existing table is touched. A stored file with no row here is treated
-- as "unverified", so nothing about existing uploads changes. Safe to run twice.
CREATE TABLE IF NOT EXISTS "stored_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" varchar(1000) NOT NULL,
	"sha256" varchar(64),
	"size_bytes" bigint,
	"content_type" varchar(150),
	"uploaded_by_user_id" integer,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"integrity_status" varchar(12) DEFAULT 'unverified' NOT NULL,
	"last_checked_at" timestamp,
	CONSTRAINT "stored_files_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stored_files_status_idx" ON "stored_files" ("integrity_status");
