-- HR has looked at this clock-in (verified it or flagged it). "Resolve flags" lists only the ones not yet reviewed.
-- ADDITIVE ONLY: one nullable column. Safe to run twice.
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp;
