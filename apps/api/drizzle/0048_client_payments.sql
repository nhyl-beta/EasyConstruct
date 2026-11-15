-- Records money actually received from a client (the one source of cash flow
-- inflow). ADDITIVE ONLY: one new table, one new id sequence.
CREATE SEQUENCE IF NOT EXISTS "payment_seq" START 1;

CREATE TABLE IF NOT EXISTS "client_payments" (
  "id" varchar(32) PRIMARY KEY,
  "project" varchar(255) NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "received_at" timestamp NOT NULL DEFAULT now(),
  "note" text,
  "created_by" varchar(255),
  "created_at" timestamp NOT NULL DEFAULT now()
);
