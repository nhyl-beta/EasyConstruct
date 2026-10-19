CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(20) NOT NULL,
	"site" varchar(255) NOT NULL,
	"clock_in" varchar(10) NOT NULL,
	"clock_out" varchar(10),
	"hours" numeric(4, 1),
	"geofence" varchar(20) DEFAULT 'Inside' NOT NULL,
	"photo" varchar(20) DEFAULT 'Pending' NOT NULL,
	"status" varchar(20) DEFAULT 'Pending' NOT NULL,
	"log_date" date NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"project" varchar(50) NOT NULL,
	"type" varchar(50) NOT NULL,
	"version" varchar(10) DEFAULT 'v1' NOT NULL,
	"size" varchar(20),
	"uploaded_by" varchar(100) NOT NULL,
	"file_url" varchar(500),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "documents_document_id_unique" UNIQUE("document_id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"initials" varchar(5) NOT NULL,
	"role" varchar(100) NOT NULL,
	"department" varchar(100) NOT NULL,
	"site" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'Active' NOT NULL,
	"attendance_rate" integer DEFAULT 100 NOT NULL,
	"performance" numeric(3, 1) DEFAULT '4.0' NOT NULL,
	"hired_on" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "employees_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" varchar(500),
	"type" varchar(50) DEFAULT 'info' NOT NULL,
	"role" varchar(50),
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll" (
	"id" serial PRIMARY KEY NOT NULL,
	"emp_id" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"initials" varchar(5) NOT NULL,
	"role" varchar(100) NOT NULL,
	"hours" integer DEFAULT 0 NOT NULL,
	"overtime" integer DEFAULT 0 NOT NULL,
	"gross" numeric(10, 2) NOT NULL,
	"deductions" numeric(10, 2) NOT NULL,
	"net" numeric(10, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'Pending' NOT NULL,
	"period" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"pm" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'Planning' NOT NULL,
	"status_tone" varchar(50) DEFAULT 'muted' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"budget" integer DEFAULT 0 NOT NULL,
	"due" varchar(20) NOT NULL,
	"risk" varchar(20) DEFAULT 'Low' NOT NULL,
	"location" varchar(255),
	"client" varchar(255),
	"workforce" integer DEFAULT 0,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposal_id" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"project_code" varchar(50) NOT NULL,
	"submitted_by" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'Pending' NOT NULL,
	"amount" varchar(50),
	"content" text,
	"ai_validation" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "proposals_proposal_id_unique" UNIQUE("proposal_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"label" varchar(100) NOT NULL,
	"description" varchar(255),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'site_personnel' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DROP TABLE "demo_users" CASCADE;