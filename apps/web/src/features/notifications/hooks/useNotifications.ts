import { useCallback, useEffect, useState } from "react";
import { NotificationRepository } from "../repositories/notification.repository";
import { useNotificationStream } from "./useNotificationStream";
import type { Notification, NotificationsQuery } from "../types/notification.types";

export function useNotifications(query: NotificationsQuery = {}) {
  const { role, unreadOnly } = query;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await NotificationRepository.list({ role, unreadOnly });
      setNotifications(result);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to load notifications."),
      );
    } finally {
      setLoading(false);
    }
  }, [role, unreadOnly]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // C1: prepend pushed notifications as they arrive instead of waiting for
  // the next popover-open refetch. Guards against a duplicate in case a
  // reload() and a push race and both land the same row.
  useNotificationStream((notification) => {
    setNotifications((prev) =>
      prev.some((n) => n.id === notification.id) ? prev : [notification, ...prev],
    );
  });

  const markRead = useCallback(
    async (id: number) => {
      setMarking(id);
      setError(null);

      try {
        const updated = await NotificationRepository.markRead(id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? updated : n)),
        );
        return updated;
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("Failed to mark notification as read."),
        );
        return null;
      } finally {
        setMarking(null);
      }
    },
    [],
  );

  // There is no bulk endpoint, so each unread one is marked in turn; the list is
  // refreshed afterwards so it shows what the server actually has.
  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0) return;
    setMarking(-1);
    setError(null);
    try {
      await Promise.all(unread.map((n) => NotificationRepository.markRead(n.id)));
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to mark notifications as read."));
      await reload();
    } finally {
      setMarking(null);
    }
  }, [notifications, reload]);

  return {
    notifications,
    markAllRead,
    loading,
    marking,
    error,
    reload,
    markRead,
  } as const;
}
