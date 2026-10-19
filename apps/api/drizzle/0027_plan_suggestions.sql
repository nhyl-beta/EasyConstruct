-- Suggested plan on an approved proposal (objectives fix 3.1).
-- ADDITIVE ONLY: two new tables and indexes. No existing table or column is
-- touched, and every statement is safe to run twice.

CREATE TABLE IF NOT EXISTS "plan_suggestions" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_code" varchar(50) NOT NULL,
  "proposal_id" integer NOT NULL REFERENCES "proposals"("id"),
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "basis" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_suggestions_proposal_unique" ON "plan_suggestions" ("proposal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_suggestions_project_idx" ON "plan_suggestions" ("project_code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_suggestion_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "suggestion_id" integer NOT NULL REFERENCES "plan_suggestions"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "payload" jsonb NOT NULL,
  "state" varchar(20) DEFAULT 'pending' NOT NULL,
  "created_ref" varchar(50),
  "decided_by" varchar(100),
  "decided_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_suggestion_items_suggestion_idx" ON "plan_suggestion_items" ("suggestion_id", "state");
