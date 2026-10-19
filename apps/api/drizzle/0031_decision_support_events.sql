-- Usefulness events for decision support (objectives fix 3.7).
-- ADDITIVE ONLY: one new table and two indexes. Stores the user id and nothing
-- else about the person. Every statement is safe to run twice.

CREATE TABLE IF NOT EXISTS "decision_support_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "kind" varchar(30) NOT NULL,
  "item_key" varchar(200) NOT NULL,
  "project_code" varchar(50),
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "action" varchar(20) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "decision_support_events_once" ON "decision_support_events" ("kind", "item_key", "user_id", "action");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_support_events_kind_idx" ON "decision_support_events" ("kind", "action");
