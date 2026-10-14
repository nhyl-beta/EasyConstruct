import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

export const payroll = pgTable("payroll", {
  id: serial("id").primaryKey(),
  empId: varchar("emp_id", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  initials: varchar("initials", { length: 5 }).notNull(),
  role: varchar("role", { length: 100 }).notNull(),
  // Owning batch (payroll_batches.id). Null only on legacy lines that
  // pre-date batch-linked lines.
  batchId: varchar("batch_id", { length: 32 }),
  // Exact hours — gross is computed from these, so rounding them (as the old
  // integer columns did) made hours × rate disagree with the stored gross.
  hours: numeric("hours", { precision: 8, scale: 2, mode: "number" }).notNull().default(0),
  overtime: numeric("overtime", { precision: 8, scale: 2, mode: "number" }).notNull().default(0),
  adjustments: numeric("adjustments", { precision: 12, scale: 2 }).notNull().default("0"),
  gross: numeric("gross", { precision: 10, scale: 2 }).notNull(),
  // Philippine statutory deductions, each computed on its own base — see
  // payroll/ph-statutory.ts. `deductions` stays as the total of the three so
  // existing readers (Finance payroll review, batch rollups) keep working.
  sss: numeric("sss", { precision: 10, scale: 2 }).notNull().default("0"),
  philhealth: numeric("philhealth", { precision: 10, scale: 2 }).notNull().default("0"),
  pagibig: numeric("pagibig", { precision: 10, scale: 2 }).notNull().default("0"),
  deductions: numeric("deductions", { precision: 10, scale: 2 }).notNull(),
  // Employer-side statutory contributions (not deducted from pay) and the
  // resulting labor cost: gross + employer contributions.
  employerSss: numeric("employer_sss", { precision: 10, scale: 2 }).notNull().default("0"),
  employerEc: numeric("employer_ec", { precision: 10, scale: 2 }).notNull().default("0"),
  employerPhilhealth: numeric("employer_philhealth", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  employerPagibig: numeric("employer_pagibig", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  employerCost: numeric("employer_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  // Rate-version IDs the engine used for this line, e.g. {"sss":"builtin-sss-2025",...}
  rateVersions: jsonb("rate_versions").$type<Record<string, string>>(),
  net: numeric("net", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("Pending"),
  period: varchar("period", { length: 50 }).notNull(),
  periodStart: varchar("period_start", { length: 10 }),
  periodEnd: varchar("period_end", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Payroll = typeof payroll.$inferSelect;
export type NewPayroll = typeof payroll.$inferInsert;

// One row per Finance decision on a batch. (batch_id, round) is unique so a
// second decision on the same submission round fails at the database too.
export const payrollBatchDecisions = pgTable(
  "payroll_batch_decisions",
  {
    id: serial("id").primaryKey(),
    batchId: varchar("batch_id", { length: 32 }).notNull(),
    round: integer("round").notNull(),
    action: varchar("action", { length: 20 }).notNull(), // approved | rejected
    reasonCode: varchar("reason_code", { length: 50 }),
    comment: text("comment"),
    decidedBy: varchar("decided_by", { length: 255 }).notNull(),
    decidedAt: timestamp("decided_at").defaultNow().notNull(),
  },
  (t) => [unique("payroll_batch_decisions_batch_round_unique").on(t.batchId, t.round)],
);

export type PayrollBatchDecision = typeof payrollBatchDecisions.$inferSelect;


// Warnings HR acknowledged when submitting a batch (objectives fix 2.4): one row
// per submission round, listing exactly what was acknowledged. A separate table
// so the existing payroll_batches queries are untouched.
export const payrollBatchAcknowledgements = pgTable(
  "payroll_batch_acknowledgements",
  {
    id: serial("id").primaryKey(),
    batchId: varchar("batch_id", { length: 32 }).notNull(),
    round: integer("round").notNull(),
    acknowledgedBy: varchar("acknowledged_by", { length: 255 }).notNull(),
    acknowledgedAt: timestamp("acknowledged_at").defaultNow().notNull(),
    items: jsonb("items").$type<{ key: string; message: string }[]>().notNull(),
  },
  (t) => [unique("payroll_batch_acks_batch_round_unique").on(t.batchId, t.round)],
);

export type PayrollBatchAcknowledgement = typeof payrollBatchAcknowledgements.$inferSelect;
