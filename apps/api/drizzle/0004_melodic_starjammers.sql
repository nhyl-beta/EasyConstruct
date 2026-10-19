CREATE TABLE "architect_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"design_id" integer,
	"title" varchar(255) NOT NULL,
	"category" varchar(50) NOT NULL,
	"version" varchar(20) DEFAULT 'v1.0' NOT NULL,
	"owner" varchar(100) NOT NULL,
	"file_type" varchar(20) DEFAULT 'PDF' NOT NULL,
	"size_kb" integer DEFAULT 0 NOT NULL,
	"status" varchar(50) DEFAULT 'Draft' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "blueprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"drawing_number" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"folder" varchar(100) NOT NULL,
	"discipline" varchar(50),
	"scale" varchar(20),
	"revision" varchar(20) DEFAULT 'A' NOT NULL,
	"author" varchar(100) NOT NULL,
	"approval" varchar(50) DEFAULT 'Pending' NOT NULL,
	"status" varchar(50) DEFAULT 'Current' NOT NULL,
	"file_type" varchar(20) DEFAULT 'DWG' NOT NULL,
	"size_kb" integer DEFAULT 0 NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"tags" text,
	"issue_date" timestamp DEFAULT now(),
	"latest_revision_date" timestamp DEFAULT now(),
	CONSTRAINT "blueprints_drawing_number_unique" UNIQUE("drawing_number")
);
--> statement-breakpoint
CREATE TABLE "design_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"design_id" integer NOT NULL,
	"discipline" varchar(50),
	"priority" varchar(20) DEFAULT 'Medium' NOT NULL,
	"reviewers" text,
	"requested_by" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'Pending' NOT NULL,
	"submitted_at" timestamp DEFAULT now(),
	"due_date" varchar(20),
	"completed_at" timestamp,
	CONSTRAINT "design_reviews_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "design_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"design_id" integer NOT NULL,
	"version" varchar(20) NOT NULL,
	"parent_version" varchar(20),
	"revision_number" integer DEFAULT 1 NOT NULL,
	"reason" varchar(255),
	"change_summary" text,
	"status" varchar(50) DEFAULT 'Draft' NOT NULL,
	"created_by" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"approved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "designs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"project_code" varchar(50) NOT NULL,
	"discipline" varchar(50) NOT NULL,
	"category" varchar(50) NOT NULL,
	"phase" varchar(50) DEFAULT 'Design Development' NOT NULL,
	"version" varchar(20) DEFAULT 'v0.1' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"status" varchar(50) DEFAULT 'Draft' NOT NULL,
	"lead_architect" varchar(100) NOT NULL,
	"client" varchar(255),
	"building" varchar(100),
	"floor" varchar(50),
	"zone" varchar(50),
	"description" text,
	"file_count" integer DEFAULT 0 NOT NULL,
	"ai_completeness" integer DEFAULT 0 NOT NULL,
	"ai_confidence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "designs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "budget_allocations" ALTER COLUMN "consumed" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "architect_documents" ADD CONSTRAINT "architect_documents_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "design_reviews_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_revisions" ADD CONSTRAINT "design_revisions_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE no action ON UPDATE no action;