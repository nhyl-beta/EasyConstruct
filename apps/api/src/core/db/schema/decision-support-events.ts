// apps/api/src/db/schema/decision-support-events.ts (objectives fix 3.7)
//
// One row each time a person is shown a piece of decision support, accepts it, or
// dismisses it. Used only to measure whether the advice is useful. It holds the
// user id and nothing else about the person. A row is recorded at most once per
// (kind, item, user, action), so repeating a request never inflates a count.
import { index, integer, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const decisionSupportEvents = pgTable(
  "decision_support_events",
  {
    id: serial("id").primaryKey(),
    kind: varchar("kind", { length: 30 }).notNull(),
    itemKey: varchar("item_key", { length: 200 }).notNull(),
    projectCode: varchar("project_code", { length: 50 }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    action: varchar("action", { length: 20 }).notNull(), // shown | accepted | dismissed
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("decision_support_events_once").on(t.kind, t.itemKey, t.userId, t.action),
    index("decision_support_events_kind_idx").on(t.kind, t.action),
  ],
);

export type DecisionSupportEvent = typeof decisionSupportEvents.$inferSelect;
