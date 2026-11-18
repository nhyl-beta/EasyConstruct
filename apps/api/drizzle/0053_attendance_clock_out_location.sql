-- Where a worker clocked out from, so each site visit has proof at both ends (B-185).
-- ADDITIVE ONLY: three nullable columns. Safe to run twice.
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "clock_out_latitude" numeric(10, 7);
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "clock_out_longitude" numeric(10, 7);
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "clock_out_geofence" varchar(20);
