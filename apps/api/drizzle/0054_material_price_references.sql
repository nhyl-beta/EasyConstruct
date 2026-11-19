-- Material unit-cost reference, so demo-seed-procurement.ts's purchase request amounts come
-- from an editable table (seed-material-prices.ts) instead of literals baked into the script.
-- ADDITIVE ONLY: one new table. Safe to run twice.
CREATE TABLE IF NOT EXISTS "material_price_references" (
	"id" serial PRIMARY KEY NOT NULL,
	"material" varchar(100) NOT NULL,
	"unit" varchar(20) NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"category" varchar(50) DEFAULT 'Materials' NOT NULL,
	"source" varchar(255) NOT NULL,
	"source_url" varchar(500),
	"as_of_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "material_price_references_material_unit_uq" ON "material_price_references" ("material","unit");
