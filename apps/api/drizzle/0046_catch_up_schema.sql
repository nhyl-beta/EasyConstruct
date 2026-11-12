-- Tables and columns the code reads that were only ever created by scripts/demo/ensure-demo-schema.ts
-- (npm run db:seed), so a database built with db:migrate alone lacked them and the dashboard queries
-- (my-actions, impact, project progress after a workflow starts) failed with a 500.
-- ADDITIVE ONLY and idempotent (IF NOT EXISTS): safe on a database that already has them.

-- Task / milestone completion evidence
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "completion_note" text,
  ADD COLUMN IF NOT EXISTS "completion_file_url" varchar(500),
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp;
ALTER TABLE "milestones"
  ADD COLUMN IF NOT EXISTS "estimated_completion_date" varchar(20),
  ADD COLUMN IF NOT EXISTS "completed_by" varchar(100),
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp;
CREATE TABLE IF NOT EXISTS "milestone_links" (
  "id" serial PRIMARY KEY,
  "milestone_id" integer NOT NULL REFERENCES "milestones"("id") ON DELETE CASCADE,
  "link_type" varchar(20) NOT NULL,
  "link_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "milestone_links_milestone_idx" ON "milestone_links" ("milestone_id");

-- Project phase history
CREATE TABLE IF NOT EXISTS "project_phase_history" (
  "id" serial PRIMARY KEY,
  "project_code" varchar(50) NOT NULL,
  "from_status" varchar(50) NOT NULL,
  "to_status" varchar(50) NOT NULL,
  "changed_by" varchar(100) NOT NULL,
  "changed_by_user_id" integer REFERENCES "users"("id"),
  "reason" text,
  "override" boolean NOT NULL DEFAULT false,
  "gate_snapshot" jsonb,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "project_phase_history_project_code_idx" ON "project_phase_history" ("project_code");

-- Workflow submissions and line items
CREATE TABLE IF NOT EXISTS "workflow_attachments" (
  "id" serial PRIMARY KEY,
  "workflow_id" integer NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
  "stage_id" integer REFERENCES "workflow_stages"("id") ON DELETE SET NULL,
  "kind" varchar(20) NOT NULL DEFAULT 'document',
  "label" varchar(255) NOT NULL,
  "content" text,
  "file_url" varchar(500),
  "file_name" varchar(255),
  "file_size" varchar(20),
  "uploaded_by" varchar(100) NOT NULL,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "workflow_attachments_workflow_idx" ON "workflow_attachments" ("workflow_id");
CREATE TABLE IF NOT EXISTS "workflow_line_items" (
  "id" serial PRIMARY KEY,
  "workflow_id" integer NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
  "category" varchar(30) NOT NULL,
  "description" varchar(255) NOT NULL,
  "current_amount" numeric(14, 2) NOT NULL DEFAULT 0,
  "requested_amount" numeric(14, 2) NOT NULL DEFAULT 0,
  "quantity" numeric(14, 3),
  "unit" varchar(20),
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "workflow_line_items_workflow_idx" ON "workflow_line_items" ("workflow_id");

-- AI cost validation
CREATE TABLE IF NOT EXISTS "reference_snapshots" (
  "id" serial PRIMARY KEY,
  "source" varchar(50) NOT NULL DEFAULT 'estimationpro',
  "source_item_id" varchar(100) NOT NULL,
  "trade" varchar(50) NOT NULL,
  "description" text NOT NULL,
  "unit" varchar(30) NOT NULL,
  "low_usd" numeric(12, 2) NOT NULL,
  "typical_usd" numeric(12, 2) NOT NULL,
  "high_usd" numeric(12, 2) NOT NULL,
  "region_multiplier" numeric(6, 3),
  "volatility" varchar(20),
  "currency" varchar(10) NOT NULL DEFAULT 'USD',
  "source_url" varchar(500),
  "raw_payload" jsonb,
  "fetched_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "reference_snapshots_source_item_unique" UNIQUE ("source", "source_item_id")
);
CREATE TABLE IF NOT EXISTS "validation_results" (
  "id" serial PRIMARY KEY,
  "entity_type" varchar(30) NOT NULL DEFAULT 'workflow_line_item',
  "entity_id" integer NOT NULL,
  "workflow_id" integer NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
  "project_code" varchar(50) NOT NULL,
  "line_description" varchar(255) NOT NULL,
  "line_quantity" numeric(14, 3),
  "line_unit" varchar(20),
  "project_value_php" numeric(14, 2) NOT NULL,
  "matched_snapshot_id" integer REFERENCES "reference_snapshots"("id") ON DELETE SET NULL,
  "match_score" numeric(4, 3),
  "reference_unit" varchar(30),
  "unit_factor" numeric(14, 6),
  "reference_low_usd" numeric(14, 2),
  "reference_mid_usd" numeric(14, 2),
  "reference_high_usd" numeric(14, 2),
  "reference_low_php" numeric(14, 2),
  "reference_mid_php" numeric(14, 2),
  "reference_high_php" numeric(14, 2),
  "fx_rate_used" numeric(8, 4) NOT NULL,
  "fx_rate_as_of" varchar(20) NOT NULL,
  "variance_pct" numeric(8, 4),
  "verdict" varchar(20) NOT NULL,
  "basis_summary" text NOT NULL,
  "sources" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Payroll review comment, attendance offline sync, account recovery, design engineers
ALTER TABLE "payroll_batches" ADD COLUMN IF NOT EXISTS "review_note" text;
ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "client_request_id" varchar(64),
  ADD COLUMN IF NOT EXISTS "validated_offline" boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_client_request_id_unique_idx" ON "attendance" ("client_request_id");
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp;
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "requested_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "design_engineers" (
  "id" serial PRIMARY KEY,
  "design_id" integer NOT NULL REFERENCES "designs"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "user_name" varchar(100) NOT NULL,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "design_engineers_design_user_unique" UNIQUE ("design_id", "user_id")
);
