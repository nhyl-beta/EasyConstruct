-- Advisory documents can be tied to the proposal or design they were written
-- about. Both columns are nullable and set together (documents/service.ts
-- checks the related item exists on the same project). Idempotent; also
-- mirrored in src/scripts/ensure-demo-schema.ts.
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "related_type" varchar(20),
  ADD COLUMN IF NOT EXISTS "related_id" integer;
