-- B-181: how a transmittal goes out ("Email" or "Hard copy"). ADDITIVE ONLY: one nullable column; older rows stay null.
ALTER TABLE "transmittals" ADD COLUMN IF NOT EXISTS "sent_mode" varchar(10);
