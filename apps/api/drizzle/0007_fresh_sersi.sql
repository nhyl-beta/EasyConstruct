ALTER TABLE "attendance" ADD COLUMN "attendance_status" varchar(20) DEFAULT 'Present' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "remarks" text;