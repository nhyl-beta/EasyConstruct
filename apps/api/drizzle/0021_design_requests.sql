-- RFI / RFA requests and transmittal cover sheets. Additive and idempotent;
-- mirrored in src/scripts/ensure-demo-schema.ts.
CREATE TABLE IF NOT EXISTS "design_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "kind" varchar(3) NOT NULL,
  "number" varchar(60) NOT NULL,
  "project_code" varchar(50) NOT NULL,
  "discipline" varchar(2) NOT NULL,
  "sequence" integer NOT NULL,
  "sheet_numbers" varchar(255),
  "subject" varchar(255) NOT NULL,
  "sections_referenced" varchar(255),
  "request_text" text NOT NULL,
  "cost_impact" varchar(10) DEFAULT 'none' NOT NULL,
  "cost_note" varchar(255),
  "time_impact" varchar(10) DEFAULT 'none' NOT NULL,
  "time_days" integer,
  "requested_by_user_id" integer REFERENCES "users"("id"),
  "requested_by_name" varchar(100) NOT NULL,
  "requested_by_role" varchar(30) NOT NULL,
  "countersigned_by_user_id" integer REFERENCES "users"("id"),
  "countersigned_by_name" varchar(100),
  "countersigned_at" timestamp,
  "assigned_to_user_id" integer REFERENCES "users"("id"),
  "assigned_to_name" varchar(100),
  "due_date" timestamp,
  "sent_at" timestamp,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "response_text" text,
  "responded_by_user_id" integer REFERENCES "users"("id"),
  "responded_by_name" varchar(100),
  "responded_at" timestamp,
  "returned_by_name" varchar(100),
  "returned_by_position" varchar(100),
  "returned_at" timestamp,
  "follow_up_of_id" integer,
  "design_id" integer,
  "overdue_notified_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "design_requests_number_unique" UNIQUE ("number")
);
CREATE UNIQUE INDEX IF NOT EXISTS "design_requests_project_kind_disc_seq_uq" ON "design_requests" ("project_code", "kind", "discipline", "sequence");
CREATE INDEX IF NOT EXISTS "design_requests_project_idx" ON "design_requests" ("project_code");
CREATE INDEX IF NOT EXISTS "design_requests_assignee_idx" ON "design_requests" ("assigned_to_user_id");

CREATE TABLE IF NOT EXISTS "design_request_files" (
  "id" serial PRIMARY KEY NOT NULL,
  "request_id" integer NOT NULL REFERENCES "design_requests"("id") ON DELETE CASCADE,
  "stage" varchar(10) DEFAULT 'request' NOT NULL,
  "url" varchar(500) NOT NULL,
  "filename" varchar(255) NOT NULL,
  "content_type" varchar(100) NOT NULL,
  "size_bytes" integer DEFAULT 0 NOT NULL,
  "uploaded_by_name" varchar(100) NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "transmittals" (
  "id" serial PRIMARY KEY NOT NULL,
  "control_no" varchar(60) NOT NULL,
  "project_code" varchar(50) NOT NULL,
  "sequence" integer NOT NULL,
  "date_issued" varchar(10) NOT NULL,
  "location" varchar(255),
  "to_name" varchar(255) NOT NULL,
  "thru_name" varchar(255),
  "type" varchar(20) DEFAULT 'inter-office' NOT NULL,
  "subject" varchar(255) NOT NULL,
  "purposes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "purpose_other" varchar(255),
  "transmitted_by_user_id" integer REFERENCES "users"("id"),
  "transmitted_by_name" varchar(100) NOT NULL,
  "received_by_name" varchar(255),
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "transmittals_control_no_unique" UNIQUE ("control_no")
);
CREATE UNIQUE INDEX IF NOT EXISTS "transmittals_project_seq_uq" ON "transmittals" ("project_code", "sequence");

CREATE TABLE IF NOT EXISTS "transmittal_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "transmittal_id" integer NOT NULL REFERENCES "transmittals"("id") ON DELETE CASCADE,
  "request_id" integer,
  "particulars" text NOT NULL,
  "remarks" varchar(255),
  "position" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "transmittal_acknowledgements" (
  "id" serial PRIMARY KEY NOT NULL,
  "transmittal_id" integer NOT NULL REFERENCES "transmittals"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "signature" varchar(255),
  "office" varchar(255),
  "acknowledged_at" timestamp DEFAULT now()
);
