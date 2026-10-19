CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_code" varchar(20) NOT NULL,
	"project_code" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"priority" varchar(20) DEFAULT 'Medium' NOT NULL,
	"status" varchar(20) DEFAULT 'Pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"due_date" varchar(20),
	"assigned_to_user_id" integer,
	"assigned_to_name" varchar(100),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tasks_task_code_unique" UNIQUE("task_code")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_code" varchar(20) NOT NULL,
	"project_code" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(30) DEFAULT 'Other' NOT NULL,
	"severity" varchar(20) DEFAULT 'Medium' NOT NULL,
	"status" varchar(20) DEFAULT 'Submitted' NOT NULL,
	"site_context" varchar(255),
	"attachment_url" varchar(500),
	"reported_by_user_id" integer,
	"reported_by_name" varchar(100) NOT NULL,
	"reported_by_role" varchar(50) NOT NULL,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "issues_issue_code_unique" UNIQUE("issue_code")
);
--> statement-breakpoint
ALTER TABLE "projects" RENAME COLUMN "assigned_engineer" TO "site_longitude";--> statement-breakpoint
ALTER TABLE "attendance" ALTER COLUMN "distance_from_site_m" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "site_latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "geofence_radius_m" integer DEFAULT 300;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;