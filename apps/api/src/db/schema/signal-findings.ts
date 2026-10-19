// apps/api/src/db/schema/signal-findings.ts (objectives fix 3.5)
//
// Findings from the scheduled decision-support scan. One row per distinct
// finding, keyed so a condition that stays true is one row, not one per run.
// `resolved_at` is set when the condition clears. project_code is a loose
// string reference (no FK), like the other project-scoped tables.
import { index, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const signalFindings = pgTable(
  "signal_findings",
  {
    id: serial("id").primaryKey(),
    // `${project_code}|${signal.key}`, unique across projects.
    key: varchar("key", { length: 200 }).notNull().unique(),
    projectCode: varchar("project_code", { length: 50 }).notNull(),
    rule: varchar("rule", { length: 50 }).notNull(),
    severity: varchar("severity", { length: 10 }).notNull(),
    firstSeen: timestamp("first_seen").defaultNow().notNull(),
    lastSeen: timestamp("last_seen").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [index("signal_findings_project_idx").on(t.projectCode, t.resolvedAt)],
);

export type SignalFinding = typeof signalFindings.$inferSelect;
