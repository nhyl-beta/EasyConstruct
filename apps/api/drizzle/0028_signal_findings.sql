-- Findings from the scheduled decision-support scan (objectives fix 3.5).
-- ADDITIVE ONLY: one new table and an index. No existing table or column is
-- touched, and every statement is safe to run twice.

CREATE TABLE IF NOT EXISTS "signal_findings" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" varchar(200) NOT NULL,
  "project_code" varchar(50) NOT NULL,
  "rule" varchar(50) NOT NULL,
  "severity" varchar(10) NOT NULL,
  "first_seen" timestamp DEFAULT now() NOT NULL,
  "last_seen" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp,
  CONSTRAINT "signal_findings_key_unique" UNIQUE ("key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signal_findings_project_idx" ON "signal_findings" ("project_code", "resolved_at");
