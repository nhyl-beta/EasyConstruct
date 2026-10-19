CREATE TABLE "engineering_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"project" varchar(50) NOT NULL,
	"location" varchar(255) NOT NULL,
	"date" varchar(20) NOT NULL,
	"engineer" varchar(100) NOT NULL,
	"priority" varchar(20) DEFAULT 'Medium' NOT NULL,
	"description" text NOT NULL,
	"findings" text NOT NULL,
	"measurements" text,
	"observations" text,
	"recommendations" text NOT NULL,
	"required_actions" text,
	"status" varchar(30) DEFAULT 'Submitted' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "engineering_reports_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
CREATE TABLE "requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"requirement_id" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"project" varchar(50) NOT NULL,
	"category" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"status" varchar(30) DEFAULT 'Draft' NOT NULL,
	"created_by" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "requirements_requirement_id_unique" UNIQUE("requirement_id")
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "project_code" varchar(50);--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "longitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "distance_from_site_m" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "photo_url" varchar(500);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "assigned_engineer" varchar(100);