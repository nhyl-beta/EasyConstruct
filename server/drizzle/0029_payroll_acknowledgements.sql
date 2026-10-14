-- Warnings HR acknowledged when submitting a payroll batch (objectives fix 2.4).
-- ADDITIVE ONLY: one new table. payroll_batches and payroll are not touched,
-- and every statement is safe to run twice.

CREATE TABLE IF NOT EXISTS "payroll_batch_acknowledgements" (
  "id" serial PRIMARY KEY NOT NULL,
  "batch_id" varchar(32) NOT NULL,
  "round" integer NOT NULL,
  "acknowledged_by" varchar(255) NOT NULL,
  "acknowledged_at" timestamp DEFAULT now() NOT NULL,
  "items" jsonb NOT NULL,
  CONSTRAINT "payroll_batch_acks_batch_round_unique" UNIQUE ("batch_id", "round")
);
