-- Shared reference data: clients and vendors (objectives fix 1.2).
-- ADDITIVE ONLY: two new tables and one nullable column on projects. No
-- existing column is changed, dropped or renamed; the text columns projects.client,
-- expenses.vendor and purchase_requests.preferred_vendor are kept as they are.
-- Every statement is safe to run twice.

CREATE TABLE IF NOT EXISTS "clients" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "name_key" varchar(255) NOT NULL,
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "clients_name_key_unique" UNIQUE ("name_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendors" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "name_key" varchar(255) NOT NULL,
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "vendors_name_key_unique" UNIQUE ("name_key")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "client_id" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_client_id_clients_id_fk') THEN
    ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id");
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_client_id_idx" ON "projects" ("client_id");
