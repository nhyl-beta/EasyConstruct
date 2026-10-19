-- Mark demo-generated design revisions (and the placeholder design the generator
-- may create) so they are identifiable and removable in one command.
ALTER TABLE "design_revisions" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false;
ALTER TABLE "designs" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "design_revisions_design_version_uq" ON "design_revisions" ("design_id", "version");
