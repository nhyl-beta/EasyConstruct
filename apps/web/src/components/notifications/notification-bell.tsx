// apps/web/src/components/notifications/notification-bell.tsx
//
// The header bell and its notification panel: a tabbed, card-based list with
// date filters, a primary action and Dismiss on each card, and "Mark all as
// read". The data layer is features/notifications (GET /api/notifications).
//
// Dismiss marks the notification read and hides it for this browser; there is
// no delete endpoint, so a dismissed row is not removed from the server.
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Bell, CheckCheck, CircleX } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import {
  actionLabel,
  formatStamp,
  inRange,
  isUrgent,
  matchesTab,
  type DateRange,
  type NotificationTab,
} from "@/features/notifications/lib/notification-view";
import type { Notification } from "@/features/notifications/types/notification.types";

const PAGE_SIZE = 8;
const DISMISSED_KEY = "easyconstruct.notifications.dismissed";

const TABS: Array<{ id: NotificationTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "urgent", label: "Urgent" },
  { id: "unread", label: "Unread" },
];
const RANGES: Array<{ id: DateRange; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "Last 7 Days" },
];

const readDismissed = (): Set<number> => {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === "number") : []);
  } catch {
    return new Set();
  }
};

export function NotificationBell() {
  const { notifications, loading, error, marking, markRead, markAllRead, reload } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NotificationTab>("all");
  const [range, setRange] = useState<DateRange | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [dismissed, setDismissed] = useState<Set<number>>(readDismissed);

  useEffect(() => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed].slice(-500)));
    } catch {
      /* storage can be unavailable; dismissal then lasts for this visit only */
    }
  }, [dismissed]);

  const visible = useMemo(() => notifications.filter((n) => !dismissed.has(n.id)), [notifications, dismissed]);
  const unreadCount = visible.filter((n) => !n.isRead).length;
  const filtered = useMemo(
    () => visible.filter((n) => matchesTab(n, tab) && inRange(n.createdAt, range)),
    [visible, tab, range],
  );
  const items = filtered.slice(0, shown);

  const openItem = (n: Notification) => {
    if (!n.isRead) void markRead(n.id);
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };
  const dismiss = (n: Notification) => {
    if (!n.isRead) void markRead(n.id);
    setDismissed((prev) => new Set(prev).add(n.id));
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Refetch on open so the list is current without polling.
        if (next) {
          setShown(PAGE_SIZE);
          void reload();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-xl"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium tabular-nums text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(30rem,calc(100vw-1.5rem))] rounded-3xl p-0">
        <div className="space-y-3 px-5 pb-3 pt-5">
          <h2 className="text-2xl font-semibold tracking-tight">Notifications</h2>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="tablist" aria-label="Filter notifications" className="inline-flex rounded-xl bg-muted p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.id}
                  onClick={() => {
                    setTab(t.id);
                    setShown(PAGE_SIZE);
                  }}
                  className={`rounded-lg px-3 py-1 text-sm transition ${
                    tab === t.id ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 text-sm" role="group" aria-label="Filter by date">
              {RANGES.map((r, i) => (
                <span key={r.id} className="flex items-center gap-1">
                  {i > 0 && <span className="h-3.5 w-px bg-border" aria-hidden />}
                  <button
                    type="button"
                    aria-pressed={range === r.id}
                    onClick={() => {
                      setRange((cur) => (cur === r.id ? null : r.id));
                      setShown(PAGE_SIZE);
                    }}
                    className={`rounded-md px-1.5 py-0.5 transition ${
                      range === r.id ? "font-medium text-foreground" : "text-muted-foreground/70 hover:text-foreground"
                    }`}
                  >
                    {r.label}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-border/70" />

        {/* h-96, not max-h: Radix's viewport needs a definite height to scroll. */}
        <ScrollArea className="h-96">
          <div className="space-y-3 p-4">
            {loading && notifications.length === 0 && <p className="px-1 py-6 text-sm text-muted-foreground">Loading…</p>}
            {!loading && error && (
              <p role="alert" className="px-1 py-6 text-sm text-destructive">
                Couldn't load notifications. {error.message}
              </p>
            )}
            {!loading && !error && filtered.length === 0 && (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                {visible.length === 0 ? "Nothing to show yet." : "No notifications match these filters."}
              </p>
            )}
            {!error &&
              items.map((n) => {
                const urgent = isUrgent(n);
                const label = actionLabel(n.link);
                const busy = marking === n.id || marking === -1;
                return (
                  <article
                    key={n.id}
                    className={`rounded-2xl border p-4 shadow-sm ${
                      n.isRead ? "bg-card" : "bg-gradient-to-b from-primary-soft/50 to-card"
                    } ${urgent && !n.isRead ? "border-destructive/30" : "border-border/70"}`}
                  >
                    <span
                      aria-label={n.isRead ? "Read" : urgent ? "Unread, urgent" : "Unread"}
                      className={`mb-2 block h-2 w-2 rounded-full ${
                        n.isRead ? "bg-muted-foreground/30" : urgent ? "bg-destructive" : "bg-primary"
                      }`}
                    />
                    <h3 className="text-base font-medium leading-snug">{n.title}</h3>
                    {n.message && <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>}
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {label ? (
                          <Button size="sm" className="rounded-xl" disabled={busy} onClick={() => openItem(n)}>
                            <ArrowUpRight className="mr-1 h-3.5 w-3.5" aria-hidden /> {label}
                          </Button>
                        ) : (
                          !n.isRead && (
                            <Button size="sm" className="rounded-xl" disabled={busy} onClick={() => void markRead(n.id)}>
                              <CheckCheck className="mr-1 h-3.5 w-3.5" aria-hidden /> Mark as read
                            </Button>
                          )
                        )}
                        <Button size="sm" variant="outline" className="rounded-xl text-muted-foreground" disabled={busy} onClick={() => dismiss(n)}>
                          <CircleX className="mr-1 h-3.5 w-3.5" aria-hidden /> Dismiss
                        </Button>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatStamp(n.createdAt)}</span>
                    </div>
                  </article>
                );
              })}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between border-t border-border/70 px-5 py-3 text-sm">
          {filtered.length > shown ? (
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setShown((s) => s + PAGE_SIZE)}>
              Show more ({filtered.length - shown})
            </button>
          ) : (
            <span className="text-muted-foreground">{filtered.length === 0 ? "" : `${filtered.length} shown`}</span>
          )}
          <button
            type="button"
            disabled={unreadCount === 0 || marking === -1}
            onClick={() => void markAllRead()}
            className="inline-flex items-center gap-1 text-primary hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
          >
            <CheckCheck className="h-4 w-4" aria-hidden /> Mark all as read
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

NotificationBell.displayName = "NotificationBell";
