-- Owner account protection: a change to the Owner account made by someone else is held until the Owner approves it
-- from an email link. ADDITIVE ONLY: one new table, nothing existing is changed.
-- token_hash is the SHA-256 of the emailed token (the raw token exists only in the email). For a password reset the
-- payload holds the bcrypt hash computed at request time, never the plaintext.
CREATE TABLE IF NOT EXISTS "owner_action_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_user_id" integer NOT NULL,
	"action" varchar(30) NOT NULL,
	"payload" jsonb,
	"requested_by_user_id" integer,
	"requested_by_name" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"decided_at" timestamp,
	"decided_ip" varchar(64),
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "owner_action_requests_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "owner_action_requests_target_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE cascade,
	CONSTRAINT "owner_action_requests_requested_by_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "owner_action_requests_one_pending_uq" ON "owner_action_requests" ("target_user_id", "action") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "owner_action_requests_requester_idx" ON "owner_action_requests" ("requested_by_user_id", "created_at");
