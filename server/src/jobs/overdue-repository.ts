// server/src/jobs/overdue-repository.ts (client demo change #8)
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/connection.js";
import { overdueReminders } from "../db/schema/overdue-reminders.js";
import { users } from "../db/schema/users.js";
import { sentKey, type OverdueItemType, type Person } from "./overdue.js";

const personColumns = { id: users.id, name: users.name, email: users.email, emailOverdueReminders: users.emailOverdueReminders };

export const findPeopleByIds = async (ids: number[]): Promise<Person[]> =>
  ids.length === 0 ? [] : db.select(personColumns).from(users).where(and(inArray(users.id, ids), eq(users.isActive, true)));

export const findPeopleByRole = async (role: string): Promise<Person[]> =>
  db.select(personColumns).from(users).where(and(eq(users.role, role), eq(users.isActive, true)));

export const findPersonByName = async (name: string): Promise<Person | null> => {
  const [row] = await db.select(personColumns).from(users).where(and(eq(users.name, name), eq(users.isActive, true)));
  return row ?? null;
};

/** Keys of the emails already sent on `day`, so a repeat run the same day sends nothing twice. */
export const emailKeysSentOn = async (day: string): Promise<Set<string>> => {
  const rows = await db
    .select({ type: overdueReminders.itemType, itemId: overdueReminders.itemId, userId: overdueReminders.recipientUserId })
    .from(overdueReminders)
    .where(and(eq(overdueReminders.channel, "email"), eq(overdueReminders.sentOn, day)));
  return new Set(rows.map((r) => sentKey(r.type as OverdueItemType, r.itemId, r.userId, day)));
};

/** Records a sent alert. False when it was already recorded (another run got there first). */
export const recordSent = async (r: { type: OverdueItemType; itemId: number; userId: number; channel: "email" | "inapp"; day: string }): Promise<boolean> => {
  const rows = await db
    .insert(overdueReminders)
    .values({ itemType: r.type, itemId: r.itemId, recipientUserId: r.userId, channel: r.channel, sentOn: r.day })
    .onConflictDoNothing()
    .returning({ id: overdueReminders.id });
  return rows.length > 0;
};

/** Has this in-app alert ever been sent (any day)? The in-app alert goes once; the email repeats daily. */
export const inAppEverSent = async (type: OverdueItemType, itemId: number, userId: number): Promise<boolean> => {
  const rows = await db
    .select({ id: overdueReminders.id })
    .from(overdueReminders)
    .where(and(eq(overdueReminders.itemType, type), eq(overdueReminders.itemId, itemId), eq(overdueReminders.recipientUserId, userId), eq(overdueReminders.channel, "inapp")))
    .limit(1);
  return rows.length > 0;
};

export const getEmailSetting = async (userId: number): Promise<boolean> => {
  const [row] = await db.select({ on: users.emailOverdueReminders }).from(users).where(eq(users.id, userId));
  return row?.on ?? true;
};

export const setEmailSetting = async (userId: number, value: boolean): Promise<boolean> => {
  const [row] = await db.update(users).set({ emailOverdueReminders: value, updatedAt: new Date() }).where(eq(users.id, userId)).returning({ on: users.emailOverdueReminders });
  return row?.on ?? value;
};
