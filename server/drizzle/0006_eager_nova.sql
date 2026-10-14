-- NOTE: the column additions below are guarded with IF NOT EXISTS because 0005 adds the same six
-- columns; a brand-new database failed here ("column already exists"). The original file is
-- recognised by db/migrations.ts LEGACY_HASHES, so databases that already ran it are not re-run.
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(50) NOT NULL,
	"action" varchar(50) NOT NULL,
	"actor" varchar(100) NOT NULL,
	"summary" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_batches" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"project_code" varchar(50),
	"period" varchar(32) NOT NULL,
	"group" varchar(128) NOT NULL,
	"employees" integer NOT NULL,
	"overtime_hours" numeric(10, 2) DEFAULT 0 NOT NULL,
	"gross_payroll" numeric(14, 2) NOT NULL,
	"deductions" numeric(14, 2) DEFAULT 0 NOT NULL,
	"net_payroll" numeric(14, 2) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar(255),
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "email" varchar(255);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "phone" varchar(30);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "pay_rate" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "rate_type" varchar(20) DEFAULT 'Monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll" ADD COLUMN IF NOT EXISTS "period_start" varchar(10);--> statement-breakpoint
ALTER TABLE "payroll" ADD COLUMN IF NOT EXISTS "period_end" varchar(10);--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_email_unique" UNIQUE("email");