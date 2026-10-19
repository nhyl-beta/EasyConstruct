-- Engineering reports filed under a mis-cased project code (the report form
-- upper-cased it, e.g. "ZH-01" for the project "Zh-01") matched no project, so
-- the Project Manager never saw them and gate X1 never counted them. Re-point
-- each one at the project whose code matches ignoring case. Only touches rows
-- whose code matches no project exactly and exactly one project loosely.
-- Idempotent; mirrored in src/scripts/ensure-demo-schema.ts.
UPDATE "engineering_reports" r
   SET "project" = p."code"
  FROM "projects" p
 WHERE lower(p."code") = lower(r."project")
   AND p."code" <> r."project"
   AND NOT EXISTS (SELECT 1 FROM "projects" x WHERE x."code" = r."project")
   AND (SELECT count(*) FROM "projects" y WHERE lower(y."code") = lower(r."project")) = 1;
