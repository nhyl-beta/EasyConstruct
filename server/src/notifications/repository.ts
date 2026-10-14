import { db } from "../db/connection.js";
import { notifications } from "../db/schema/notifications.js";
import { eq, and, or, desc, isNull, SQL } from "drizzle-orm";
import type {
  CreateNotificationInput,
  NotificationFilters,
  NotificationScope,
} from "./types.js";

export const findForRecipient = async (
  scope: NotificationScope,
  filters: NotificationFilters = {},
) => {
  // Mine: addressed to me by name, or role-addressed to my role with no
  // specific user named. Never an arbitrary ?role= from the query string —
  // that let anyone read every other role's notifications just by asking.
  const conditions: SQL[] = [
    or(
      eq(notifications.recipientUserId, scope.userId),
      and(isNull(notifications.recipientUserId), eq(notifications.role, scope.role)),
    )!,
  ];

  if (filters.unreadOnly) {
    conditions.push(eq(notifications.isRead, false));
  }

  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt));
};

export const create = async (data: CreateNotificationInput) => {
  const [created] = await db
    .insert(notifications)
    .values({
      title: data.title,
      message: data.body,
      role: data.recipientRole ?? null,
      recipientUserId: data.recipientUserId ?? null,
      projectCode: data.projectCode ?? null,
      link: data.link ?? null,
    })
    .returning();

  return created;
};

export const findById = async (id: number) => {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
  return row ?? null;
};

export const markRead = async (id: number) => {
  const [updated] = await db
    .update(notifications)
    .set({
      isRead: true,
    })
    .where(eq(notifications.id, id))
    .returning();

  return updated ?? null;
};