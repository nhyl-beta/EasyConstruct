import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../../../core/db/connection.js";
import { notifications } from "../../../core/db/schema/index.js";
import { realtime } from "../../../core/realtime/index.js";

// Same inbox rule as repository.findForRecipient. Only id + isRead leave the server: the browser
// uses the change as a signal and refetches through the normal, authorised GET /notifications.
export async function sealInbox(scope: { userId: number; role: string }) {
  if (!realtime) return null;
  const query = db
    .select({ id: notifications.id, isRead: notifications.isRead })
    .from(notifications)
    .where(or(
      eq(notifications.recipientUserId, scope.userId),
      and(isNull(notifications.recipientUserId), eq(notifications.role, scope.role)),
    ));
  return realtime.seal({ query });
}
