-- Revision management: immutable, per-item version history with files.
-- Additive and idempotent; mirrored in src/scripts/ensure-demo-schema.ts.
CREATE TABLE IF NOT EXISTS "revisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_code" varchar(50) NOT NULL,
  "architect_id" integer NOT NULL REFERENCES "users"("id"),
  "created_by_name" varchar(100) NOT NULL,
  "item_type" varchar(20) NOT NULL,
  "item_id" integer NOT NULL,
  "item_title" varchar(255) NOT NULL,
  "version_number" integer NOT NULL,
  "version_label" varchar(50),
  "file_url" varchar(500) NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "file_size" integer DEFAULT 0 NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "change_summary" text NOT NULL,
  "status" varchar(20) DEFAULT 'Submitted' NOT NULL,
  "reviewed_by" varchar(100),
  "reviewed_by_user_id" integer REFERENCES "users"("id"),
  "reviewed_at" timestamp,
  "review_comment" text,
  "is_current" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "revisions_item_version_uq" ON "revisions" ("item_type", "item_id", "version_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "revisions_one_current_uq" ON "revisions" ("item_type", "item_id") WHERE "is_current";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revisions_project_idx" ON "revisions" ("project_code");
--> statement-breakpoint
ALTER TABLE "architect_documents" ADD COLUMN IF NOT EXISTS "project_code" varchar(50);
