-- Payroll lifecycle: batch-linked lines with exact hours, employer-side
-- contributions, rate versions, batch rounds and the Finance decision history.
-- Idempotent (also mirrored in src/scripts/ensure-demo-schema.ts).
ALTER TABLE "payroll"
  ADD COLUMN IF NOT EXISTS "batch_id" varchar(32),
  ADD COLUMN IF NOT EXISTS "adjustments" numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "employer_sss" numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "employer_ec" numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "employer_philhealth" numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "employer_pagibig" numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "employer_cost" numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rate_versions" jsonb;
--> statement-breakpoint
ALTER TABLE "payroll" ALTER COLUMN "hours" SET DATA TYPE numeric(8, 2);
--> statement-breakpoint
ALTER TABLE "payroll" ALTER COLUMN "overtime" SET DATA TYPE numeric(8, 2);
--> statement-breakpoint
ALTER TABLE "payroll_batches"
  ADD COLUMN IF NOT EXISTS "round" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "employer_cost" numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "submitted_at" timestamp;
--> statement-breakpoint
UPDATE "payroll_batches" SET "status" = 'revision_required' WHERE "status" = 'rejected';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_batch_decisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "batch_id" varchar(32) NOT NULL,
  "round" integer NOT NULL,
  "action" varchar(20) NOT NULL,
  "reason_code" varchar(50),
  "comment" text,
  "decided_by" varchar(255) NOT NULL,
  "decided_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "payroll_batch_decisions_batch_round_unique" UNIQUE("batch_id","round")
);
