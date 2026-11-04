-- User Support: account-related help requests from any role to IT. ADDITIVE ONLY: one new table.
CREATE TABLE IF NOT EXISTS "support_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"requester_user_id" integer,
	"requester_name" varchar(100) NOT NULL,
	"requester_role" varchar(50) NOT NULL,
	"category" varchar(30) NOT NULL,
	"subject" varchar(150) NOT NULL,
	"details" text NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"handled_by" varchar(100),
	"handled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "support_requests_requester_fk" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_requests_requester_idx" ON "support_requests" ("requester_user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_requests_status_idx" ON "support_requests" ("status", "created_at");
