-- Client demo change #10: PM daily, weekly and monthly reports.
-- ADDITIVE ONLY: two new nullable columns on documents (null on every existing document), one index, and the
-- three report document types (insert-if-missing). They are system types: the missing-report check reads them by name.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "report_period" varchar(10);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "period_date" date;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_report_idx" ON "documents" ("project", "report_period", "period_date");
--> statement-breakpoint
INSERT INTO "document_types" ("name", "name_key", "category", "is_system") VALUES
	('Daily Report', 'daily report', 'Reports', true),
	('Weekly Report', 'weekly report', 'Reports', true),
	('Monthly Report', 'monthly report', 'Reports', true)
ON CONFLICT ("name_key") DO NOTHING;
