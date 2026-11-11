-- Blueprints can carry the uploaded file (DWG, PDF, ...). ADDITIVE ONLY: one nullable column.
ALTER TABLE "blueprints" ADD COLUMN IF NOT EXISTS "file_url" text;
