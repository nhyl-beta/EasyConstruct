// apps/api/src/db/schema/overdue-reminders.ts (client demo change #8)
//
// A record of each overdue alert already sent, so a daily job never repeats one: one email per item and
// person per day at most, and the in-app alert for an overdue workflow stage only once. `sent_on` is the
// Manila calendar day (YYYY-MM-DD). `item_type` is rfi | stage | report.
import { index, integer, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const overdueReminders = pgTable(
  "overdue_reminders",
  {
    id: serial("id").primaryKey(),
    itemType: varchar("item_type", { length: 20 }).notNull(),
    itemId: integer("item_id").notNull(),
    // 0 = a role broadcast (the in-app alert to every Admin).
    recipientUserId: integer("recipient_user_id").notNull(),
    channel: varchar("channel", { length: 10 }).notNull(), // email | inapp
    sentOn: varchar("sent_on", { length: 10 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("overdue_reminders_once_uq").on(t.itemType, t.itemId, t.recipientUserId, t.channel, t.sentOn),
    index("overdue_reminders_item_idx").on(t.itemType, t.itemId),
  ],
);

export type OverdueReminder = typeof overdueReminders.$inferSelect;
