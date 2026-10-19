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
