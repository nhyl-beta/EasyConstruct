-- Client demo change #1: editable document types.
-- ADDITIVE ONLY: one new table and its seed rows. documents.type is untouched (still varchar(50)),
-- so every existing document keeps working whatever its type. Safe to run twice.
CREATE TABLE IF NOT EXISTS "document_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"name_key" varchar(50) NOT NULL,
	"category" varchar(50) DEFAULT 'General' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_types_name_key_unique" UNIQUE("name_key")
);
--> statement-breakpoint
-- Insert-if-missing. The is_system rows are the types lifecycle/gates.ts reads by exact name.
INSERT INTO "document_types" ("name", "name_key", "category", "is_system") VALUES
	('Field Report', 'field report', 'Field', false),
	('Site Photo', 'site photo', 'Field', false),
	('Progress Evidence', 'progress evidence', 'Field', false),
	('Supporting Document', 'supporting document', 'Field', false),
	('Notice of Award', 'notice of award', 'Project', true),
	('Contract', 'contract', 'Project', true),
	('Notice to Proceed', 'notice to proceed', 'Project', true),
	('Certificate of Completion', 'certificate of completion', 'Project', true),
	('Turnover Document', 'turnover document', 'Project', true),
	('Client Acceptance', 'client acceptance', 'Project', true),
	('As-Built Drawing', 'as built drawing', 'Project', true),
	('Permit', 'permit', 'Legal', false),
	('NDA', 'nda', 'Legal', false),
	('Clearance', 'clearance', 'Legal', false),
	('Bond', 'bond', 'Legal', false),
	('Insurance', 'insurance', 'Legal', false)
ON CONFLICT ("name_key") DO NOTHING;
