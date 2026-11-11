-- Page-1 preview image of an uploaded PDF blueprint. ADDITIVE ONLY: one nullable column.
ALTER TABLE "blueprints" ADD COLUMN IF NOT EXISTS "thumbnail" text;
