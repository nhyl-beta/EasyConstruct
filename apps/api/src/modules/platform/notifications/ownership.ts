// Who a notification belongs to (pure). Mirrors the inbox rule in repository.findForRecipient:
// addressed to the person, or role-addressed to their role with no person named.
import type { NotificationScope } from "./types.js";

export function ownsNotification(
  row: { recipientUserId: number | null; role: string | null },
  scope: NotificationScope,
): boolean {
  if (row.recipientUserId != null) return row.recipientUserId === scope.userId;
  return row.role != null && row.role === scope.role;
}
