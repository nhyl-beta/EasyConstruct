ALTER TABLE "proposals" ADD COLUMN "assigned_reviewer" varchar(100);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "review_comment" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "reviewer_name" varchar(100);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "reviewed_at" timestamp;