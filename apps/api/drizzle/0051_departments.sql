-- HR-managed department list (replaces the hardcoded list in the web app).
-- ADDITIVE ONLY: one new table, seeded from the departments employees already use plus the defaults.
-- Safe to run twice.

CREATE TABLE IF NOT EXISTS "departments" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(100) NOT NULL,
  "name_key" varchar(100) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "departments_name_key_unique" UNIQUE ("name_key")
);
--> statement-breakpoint
INSERT INTO "departments" ("name", "name_key")
SELECT DISTINCT ON (lower(trim(d))) trim(d), lower(trim(d))
FROM (
  SELECT "department" AS d FROM "employees"
  UNION ALL SELECT unnest(ARRAY['Administration','Field Operations','Project Management','Engineering','Finance','Human Resources','Design','Safety','Legal'])
) s
WHERE trim(d) <> ''
ON CONFLICT ("name_key") DO NOTHING;
