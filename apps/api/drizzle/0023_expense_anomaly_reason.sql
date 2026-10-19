-- Why an expense was flagged by the rule-based anomaly check (decision support).
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "anomaly_reason" text;
