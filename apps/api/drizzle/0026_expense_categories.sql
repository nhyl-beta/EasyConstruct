-- Managed expense categories: one list shared by budgets, expenses, purchase
-- requests, reimbursements and procurement orders.
-- ADDITIVE ONLY: one new table plus an idempotent seed. No existing table or
-- column is touched (the category columns stay free-text varchar(64)), and
-- every statement is safe to run twice.

CREATE TABLE IF NOT EXISTS "expense_categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(64) NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_categories_name_lower_unique" ON "expense_categories" (lower("name"));
--> statement-breakpoint
INSERT INTO "expense_categories" ("name", "is_system", "sort_order", "created_by") VALUES
  ('Materials', true, 10, 'system'),
  ('Labor', true, 20, 'system'),
  ('Equipment', true, 30, 'system'),
  ('Subcontractors', false, 40, 'system'),
  ('Permits', false, 50, 'system'),
  ('PPE', false, 60, 'system'),
  ('Transport', false, 70, 'system'),
  ('Services', false, 80, 'system'),
  ('Contingency', false, 90, 'system'),
  ('Other', false, 100, 'system')
ON CONFLICT DO NOTHING;
