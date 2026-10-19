-- Purchase requests, procurement orders and reimbursement claims.
-- ADDITIVE ONLY: new nullable columns / columns with defaults, new sequences,
-- new indexes. Nothing is dropped, renamed, re-typed or deleted, and every
-- statement is idempotent so it is safe to run twice.

-- ── purchase_requests ──────────────────────────────────────────────────────
ALTER TABLE "purchase_requests"
  ADD COLUMN IF NOT EXISTS "category" varchar(64),
  ADD COLUMN IF NOT EXISTS "requirement_id" integer REFERENCES "requirements"("id"),
  ADD COLUMN IF NOT EXISTS "line_items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "needed_by" date,
  ADD COLUMN IF NOT EXISTS "justification" text,
  ADD COLUMN IF NOT EXISTS "preferred_vendor" varchar(255),
  ADD COLUMN IF NOT EXISTS "requested_by_user_id" integer,
  ADD COLUMN IF NOT EXISTS "requested_by_role" varchar(40),
  ADD COLUMN IF NOT EXISTS "endorsed_by" varchar(255),
  ADD COLUMN IF NOT EXISTS "endorsed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "decided_by" varchar(255),
  ADD COLUMN IF NOT EXISTS "decided_at" timestamp,
  ADD COLUMN IF NOT EXISTS "decision_note" text,
  ADD COLUMN IF NOT EXISTS "over_budget" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "committed_amount" numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

-- ── procurement_orders ─────────────────────────────────────────────────────
ALTER TABLE "procurement_orders"
  ADD COLUMN IF NOT EXISTS "purchase_request_id" varchar(32),
  ADD COLUMN IF NOT EXISTS "category" varchar(64),
  ADD COLUMN IF NOT EXISTS "line_items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "eta_date" date,
  ADD COLUMN IF NOT EXISTS "shipped_at" timestamp,
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamp,
  ADD COLUMN IF NOT EXISTS "received_by_user_id" integer,
  ADD COLUMN IF NOT EXISTS "received_by" varchar(255),
  ADD COLUMN IF NOT EXISTS "delivery_note" text,
  ADD COLUMN IF NOT EXISTS "delivery_receipt_url" text,
  ADD COLUMN IF NOT EXISTS "invoice_number" varchar(128),
  ADD COLUMN IF NOT EXISTS "invoice_amount" numeric(14, 2),
  ADD COLUMN IF NOT EXISTS "variance_note" text,
  ADD COLUMN IF NOT EXISTS "paid_at" timestamp,
  ADD COLUMN IF NOT EXISTS "paid_by" varchar(255),
  ADD COLUMN IF NOT EXISTS "expense_id" varchar(32),
  ADD COLUMN IF NOT EXISTS "created_by" varchar(255),
  ADD COLUMN IF NOT EXISTS "created_by_user_id" integer,
  ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

-- One order per purchase request.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procurement_orders_purchase_request_id_unique') THEN
    ALTER TABLE "procurement_orders"
      ADD CONSTRAINT "procurement_orders_purchase_request_id_unique" UNIQUE ("purchase_request_id");
  END IF;
END $$;

-- ── reimbursements ─────────────────────────────────────────────────────────
ALTER TABLE "reimbursements"
  ADD COLUMN IF NOT EXISTS "claimant_user_id" integer,
  ADD COLUMN IF NOT EXISTS "claimant_role" varchar(40),
  ADD COLUMN IF NOT EXISTS "project" varchar(255),
  ADD COLUMN IF NOT EXISTS "category" varchar(64),
  ADD COLUMN IF NOT EXISTS "incurred_on" date,
  ADD COLUMN IF NOT EXISTS "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "endorsed_by" varchar(255),
  ADD COLUMN IF NOT EXISTS "endorsed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "decided_by" varchar(255),
  ADD COLUMN IF NOT EXISTS "decided_at" timestamp,
  ADD COLUMN IF NOT EXISTS "decision_note" text,
  ADD COLUMN IF NOT EXISTS "paid_at" timestamp,
  ADD COLUMN IF NOT EXISTS "paid_by" varchar(255),
  ADD COLUMN IF NOT EXISTS "payment_reference" varchar(128),
  ADD COLUMN IF NOT EXISTS "expense_id" varchar(32),
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

-- ── expenses: where the spend came from ────────────────────────────────────
ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "source_type" varchar(32) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "source_id" varchar(32);

-- A payment can never create two expenses.
CREATE UNIQUE INDEX IF NOT EXISTS "expenses_source_unique"
  ON "expenses" ("source_type", "source_id")
  WHERE "source_id" IS NOT NULL;

-- ── collision-safe ids ─────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS "purchase_request_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "procurement_order_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "reimbursement_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "expense_seq" START 1;

-- Start expense_seq above the largest numeric suffix of any existing EXP- id,
-- so the first generated id cannot collide with one made by the old random scheme.
SELECT setval(
  'expense_seq',
  GREATEST(
    COALESCE((SELECT MAX(substring("id" from '^EXP-(\d+)$')::bigint) FROM "expenses" WHERE "id" ~ '^EXP-\d+$'), 0) + 1,
    (SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END FROM "expense_seq")
  ),
  false
);
