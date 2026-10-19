-- Who completed a milestone and when. Nullable: existing completed milestones
-- predate this and keep NULL (the UI then shows only the status). Idempotent;
-- mirrored in src/scripts/ensure-demo-schema.ts.
ALTER TABLE "milestones"
  ADD COLUMN IF NOT EXISTS "completed_by" varchar(100),
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp;
