// apps/web/src/features/notifications/lib/notification-view.ts
//
// Pure helpers behind the notification panel: which tab and date range a
// notification belongs to, and whether it reads as urgent. The server only
// stores a free-text `type` (always "info" today), so urgency is inferred from
// the type and the wording — advisory styling only, never a behaviour change.
import type { Notification } from "../types/notification.types";

export type NotificationTab = "all" | "urgent" | "unread";
export type DateRange = "today" | "yesterday" | "week";

const URGENT_TYPES = new Set(["warning", "error", "alert", "urgent"]);
const URGENT_WORDS = /\b(overdue|rejected|sent back|needs revision|blocked|failed|escalat\w*|breach\w*|urgent)\b/i;

export const isUrgent = (n: Pick<Notification, "type" | "title" | "message">): boolean =>
  URGENT_TYPES.has(n.type.toLowerCase()) || URGENT_WORDS.test(`${n.title} ${n.message ?? ""}`);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function inRange(createdAt: string | null, range: DateRange | null, now: Date = new Date()): boolean {
  if (range === null) return true;
  if (!createdAt) return false;
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return false;
  const today = startOfDay(now).getTime();
  const day = 86_400_000;
  if (range === "today") return at.getTime() >= today;
  if (range === "yesterday") return at.getTime() >= today - day && at.getTime() < today;
  return at.getTime() >= today - 6 * day; // the last 7 days including today
}

export function matchesTab(n: Notification, tab: NotificationTab): boolean {
  if (tab === "unread") return !n.isRead;
  if (tab === "urgent") return isUrgent(n);
  return true;
}

/** "5 mins ago" / "2 hrs ago" / "Yesterday at 4:30 PM" / "Oct 3 at 9:05 AM". */
export function formatStamp(createdAt: string | null, now: Date = new Date()): string {
  if (!createdAt) return "";
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return "";
  const mins = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} ${mins === 1 ? "min" : "mins"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24 && at >= startOfDay(now)) return `${hrs} ${hrs === 1 ? "hr" : "hrs"} ago`;
  const time = at.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(startOfDay(now).getTime() - 86_400_000);
  if (at >= yesterday && at < startOfDay(now)) return `Yesterday at ${time}`;
  return `${at.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} at ${time}`;
}

/** The label of a notification's primary button, from where it leads. */
export function actionLabel(link: string | null): string | null {
  if (!link) return null;
  const path = link.split("?")[0]!.replace(/\/+$/, "");
  const labels: Array<[RegExp, string]> = [
    [/^\/payroll-review/, "Review payroll"],
    [/^\/expenses/, "Open expenses"],
    [/^\/budget/, "Open budget"],
    [/^\/approvals/, "Review"],
    [/^\/requests/, "Open request"],
    [/^\/tasks/, "Open tasks"],
    [/^\/issues/, "Open issue"],
    [/^\/projects/, "Open project"],
    [/^\/documents/, "Open documents"],
    [/^\/workflows/, "Open workflow"],
  ];
  return labels.find(([re]) => re.test(path))?.[1] ?? "Open";
}
