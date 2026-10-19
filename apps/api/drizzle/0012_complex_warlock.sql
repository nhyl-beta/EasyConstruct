CREATE TABLE "workflow_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"role" varchar(40) NOT NULL,
	"role_label" varchar(60) NOT NULL,
	"icon_key" varchar(30) DEFAULT 'UserCheck' NOT NULL,
	"status" varchar(20) DEFAULT 'upcoming' NOT NULL,
	"assigned_to" varchar(100),
	"decided_by" varchar(100),
	"decided_at" timestamp,
	"comments" varchar(1000),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500) NOT NULL,
	"avg_duration_hours" numeric(6, 1) NOT NULL,
	"default_stages" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"project_code" varchar(50) NOT NULL,
	"template_id" integer,
	"amount" numeric(14, 2),
	"type" varchar(50),
	"severity" varchar(20) DEFAULT 'medium' NOT NULL,
	"ai_note" varchar(500),
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_by" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "workflows_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE no action ON UPDATE no action;