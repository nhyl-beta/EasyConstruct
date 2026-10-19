-- RFI/RFA "send to client by email" (outbound only).
-- ADDITIVE ONLY: new nullable columns / columns with safe defaults. No drops, renames,
-- type changes or data rewrites. Safe to run twice.
-- design_requests.status is varchar(20) (not a pg enum), so the new 'client_replied'
-- value needs no DDL. design_requests.assigned_to_user_id is already nullable, so no
-- DROP NOT NULL is needed for client requests.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "client_email" varchar(255);

ALTER TABLE "design_requests" ADD COLUMN IF NOT EXISTS "recipient_type" varchar(10) DEFAULT 'internal' NOT NULL;
ALTER TABLE "design_requests" ADD COLUMN IF NOT EXISTS "recipient_email" varchar(255);
ALTER TABLE "design_requests" ADD COLUMN IF NOT EXISTS "email_status" varchar(10) DEFAULT 'not_sent' NOT NULL;
ALTER TABLE "design_requests" ADD COLUMN IF NOT EXISTS "email_resend_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "design_requests" ADD COLUMN IF NOT EXISTS "client_replied_at" timestamp;
ALTER TABLE "design_requests" ADD COLUMN IF NOT EXISTS "client_reminder_notified_at" timestamp;
