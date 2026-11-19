-- Reshape material_price_references to a low/typical/high range plus a fetchedAt cache
-- timestamp, mirroring reference_snapshots (the EstimationPro.ai-backed Decision-Support
-- catalog's own shape), instead of a single cited unit cost + as-of date.
-- ADDITIVE ONLY (this repo's migrations after 0026 may never DROP a table or column, per
-- migrations.test.ts): the old unit_cost/as_of_date columns are left in place, unused -- the
-- Drizzle schema and application code no longer read or write them. Their NOT NULL constraints
-- are relaxed so new rows (which no longer supply them) can still be inserted. Safe to run twice.
ALTER TABLE "material_price_references" ALTER COLUMN "unit_cost" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "material_price_references" ALTER COLUMN "as_of_date" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "material_price_references" ADD COLUMN IF NOT EXISTS "low_php" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "material_price_references" ADD COLUMN IF NOT EXISTS "typical_php" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "material_price_references" ADD COLUMN IF NOT EXISTS "high_php" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "material_price_references" ADD COLUMN IF NOT EXISTS "fetched_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE "material_price_references" SET "typical_php" = "unit_cost" WHERE "typical_php" IS NULL AND "unit_cost" IS NOT NULL;
--> statement-breakpoint
UPDATE "material_price_references" SET "low_php" = "typical_php" WHERE "low_php" IS NULL;
--> statement-breakpoint
UPDATE "material_price_references" SET "high_php" = "typical_php" WHERE "high_php" IS NULL;
--> statement-breakpoint
ALTER TABLE "material_price_references" ALTER COLUMN "low_php" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "material_price_references" ALTER COLUMN "typical_php" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "material_price_references" ALTER COLUMN "high_php" SET NOT NULL;
