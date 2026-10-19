-- Server-side sign-out: sessions issued before users.tokens_valid_after are rejected
-- (middleware/auth.ts). Set by POST /api/auth/logout, a password change and deactivation.
-- ADDITIVE ONLY: one nullable column. Safe to run twice.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokens_valid_after" timestamp;
