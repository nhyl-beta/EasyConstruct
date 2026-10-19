-- Client demo change #4: stakeholder list per project.
-- ADDITIVE ONLY: one new table. projects.client / client_email are untouched. The Owner backfill is a
-- separate, dry-run-by-default script (npm run db:backfill-stakeholders), not part of this migration.
CREATE TABLE IF NOT EXISTS "project_stakeholders" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"company" varchar(255),
	"role" varchar(20) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"created_by" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_stakeholders_project_idx" ON "project_stakeholders" ("project_code");
