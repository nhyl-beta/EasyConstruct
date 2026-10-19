-- Design delivery type: a project can deliver plan sets only (Proposal ->
-- Design -> Turnover) instead of the full construction path. Additive and
-- idempotent; mirrored in src/scripts/ensure-demo-schema.ts.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "delivery_type" varchar(20) DEFAULT 'Construction' NOT NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "design_disciplines" jsonb DEFAULT '[]'::jsonb NOT NULL;

CREATE TABLE IF NOT EXISTS "project_deliverables" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_code" varchar(50) NOT NULL,
  "discipline" varchar(30) NOT NULL,
  "sheet_range" varchar(100),
  "lead_user_id" integer REFERENCES "users"("id"),
  "lead_name" varchar(100),
  "status" varchar(20) DEFAULT 'not_started' NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_deliverables_project_discipline_uq" ON "project_deliverables" ("project_code", "discipline");

-- Design Turnover workflow template: Architect -> Consultant -> PM -> Admin.
-- workflow_templates is configuration (preserved by the demo reset).
INSERT INTO "workflow_templates" ("name", "description", "avg_duration_hours", "default_stages")
SELECT 'Design Turnover',
       'Architect hands over the plan sets; Consultant reviews; PM and Admin sign off the turnover to the client.',
       '60.0',
       '[{"role":"architect","roleLabel":"Architect Handover","iconKey":"FileSignature"},{"role":"consultant","roleLabel":"Consultant Review","iconKey":"UserCheck"},{"role":"project-manager","roleLabel":"PM Sign-off","iconKey":"ShieldCheck"},{"role":"admin","roleLabel":"Admin Final Approval","iconKey":"ShieldCheck"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "workflow_templates" WHERE "name" = 'Design Turnover');
