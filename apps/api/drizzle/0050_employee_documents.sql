-- B-111: documents HR attaches to an employee (resume, certificates, CV...). ADDITIVE ONLY: one new table.
CREATE TABLE IF NOT EXISTS "employee_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"doc_type" varchar(20) DEFAULT 'other' NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"uploaded_by" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employee_documents_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_documents_employee_idx" ON "employee_documents" ("employee_id", "created_at");
