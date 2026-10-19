CREATE TYPE "public"."adjustment_kind" AS ENUM('increase', 'decrease', 'transfer', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."budget_status" AS ENUM('draft', 'pending-review', 'finance-review', 'manager-review', 'approved', 'rejected', 'locked');--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"category" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"impact" text NOT NULL,
	"confidence" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals_queue" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"kind" varchar(64) NOT NULL,
	"reference" varchar(255) NOT NULL,
	"requested_by" varchar(255) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"sla_hours" integer NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_id" integer NOT NULL,
	"kind" "adjustment_kind" NOT NULL,
	"original_amount" numeric(14, 2) NOT NULL,
	"adjustment_amount" numeric(14, 2) NOT NULL,
	"new_amount" numeric(14, 2) NOT NULL,
	"reason" text NOT NULL,
	"requested_by" varchar(255) NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"approved_by" varchar(255),
	"approved_at" timestamp,
	"status" "budget_status" DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_id" integer NOT NULL,
	"department" varchar(128) NOT NULL,
	"category" varchar(64) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"consumed" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_approval_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_id" integer NOT NULL,
	"stage" varchar(32) NOT NULL,
	"decision" varchar(16),
	"actor" varchar(255),
	"comment" text,
	"decided_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "budget_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_id" integer NOT NULL,
	"author" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"kind" varchar(64),
	"size" varchar(32),
	"uploaded_by" varchar(255) NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"url" text
);
--> statement-breakpoint
CREATE TABLE "budget_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_id" integer NOT NULL,
	"action" varchar(32) NOT NULL,
	"field" varchar(64),
	"old_value" varchar(255),
	"new_value" varchar(255),
	"reason" text,
	"actor" varchar(255) NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"project" varchar(255) NOT NULL,
	"category" varchar(64) NOT NULL,
	"owner" varchar(255) NOT NULL,
	"planned" numeric(14, 2) NOT NULL,
	"committed" numeric(14, 2) DEFAULT '0' NOT NULL,
	"actual" numeric(14, 2) DEFAULT '0' NOT NULL,
	"fiscal_year" varchar(9) NOT NULL,
	"status" "budget_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_flow_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"month" varchar(16) NOT NULL,
	"inflow" numeric(14, 2) NOT NULL,
	"outflow" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"vendor" varchar(255) NOT NULL,
	"project" varchar(255) NOT NULL,
	"category" varchar(64) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(32) NOT NULL,
	"anomaly_score" real,
	"receipt_url" text
);
--> statement-breakpoint
CREATE TABLE "financial_risks" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"impact" text NOT NULL,
	"project" varchar(255) NOT NULL,
	"level" varchar(16) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procurement_orders" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"vendor" varchar(255) NOT NULL,
	"project" varchar(255) NOT NULL,
	"items" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"eta" varchar(64),
	"status" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"project" varchar(255) NOT NULL,
	"requested_by" varchar(255) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reimbursements" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"employee" varchar(255) NOT NULL,
	"purpose" varchar(255) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"cadence" varchar(64) NOT NULL,
	"time" varchar(16) NOT NULL,
	"recipients" text
);
--> statement-breakpoint
ALTER TABLE "budget_adjustments" ADD CONSTRAINT "budget_adjustments_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_allocations" ADD CONSTRAINT "budget_allocations_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_approval_steps" ADD CONSTRAINT "budget_approval_steps_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_comments" ADD CONSTRAINT "budget_comments_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_documents" ADD CONSTRAINT "budget_documents_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_history" ADD CONSTRAINT "budget_history_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;