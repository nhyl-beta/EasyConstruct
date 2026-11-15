-- Records whether issuing a transmittal tried to email it (when "To" looks like an
-- address) and whether that send succeeded. ADDITIVE ONLY: one nullable column.
ALTER TABLE "transmittals" ADD COLUMN IF NOT EXISTS "email_status" varchar(10);
