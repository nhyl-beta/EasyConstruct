ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "email" varchar(255);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "phone" varchar(50);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "pay_rate" numeric(12, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "rate_type" varchar(20) DEFAULT 'Hourly' NOT NULL;
--> statement-breakpoint
ALTER TABLE "payroll" ADD COLUMN IF NOT EXISTS "period_start" varchar(10);
--> statement-breakpoint
ALTER TABLE "payroll" ADD COLUMN IF NOT EXISTS "period_end" varchar(10);
