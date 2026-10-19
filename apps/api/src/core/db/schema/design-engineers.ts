import {
  integer,
  pgTable,
  serial,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { designs } from "./designs.js";
import { users } from "./users.js";

// A design is reviewed by however many engineers the discipline needs
// (structural + MEP + civil on one drawing set is normal), but `designs`
// only had a single assigned_engineer_id. This join table carries the real
// many-to-many; designs.assigned_engineer_id/_name are kept in place as the
// denormalized "first engineer" for existing reads and are backfilled from
// here on write. Same shape and naming as project_members.
export const designEngineers = pgTable(
  "design_engineers",
  {
    id: serial("id").primaryKey(),
    designId: integer("design_id")
      .notNull()
      .references(() => designs.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    // Denormalized display fallback, matching project_members.user_name.
    userName: varchar("user_name", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    designUserUnique: unique("design_engineers_design_user_unique").on(
      table.designId,
      table.userId,
    ),
  }),
);

export type DesignEngineer = typeof designEngineers.$inferSelect;
export type NewDesignEngineer = typeof designEngineers.$inferInsert;
