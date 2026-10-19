-- One cash flow row per month. Collapse any duplicate months first (keep the
-- newest row), then enforce it, so the monthly rollup can upsert on `month`.
DELETE FROM "cash_flow_entries" a
USING "cash_flow_entries" b
WHERE a."month" = b."month" AND a."id" < b."id";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_flow_entries_month_unique') THEN
    ALTER TABLE "cash_flow_entries" ADD CONSTRAINT "cash_flow_entries_month_unique" UNIQUE ("month");
  END IF;
END $$;