import { useEffect } from "react";
import { streamUrl } from "@/services/api.client";
import type { Notification } from "../types/notification.types";

/**
 * C1: opens the SSE connection to /notifications/stream and calls
 * onNotification for each pushed event. A supplement to, not a replacement
 * for, the existing refetch-on-popover-open in notification-bell.tsx — if
 * the stream is ever down, opening the bell still shows the current state.
 */
export function useNotificationStream(onNotification: (notification: Notification) => void) {
  useEffect(() => {
    const source = new EventSource(streamUrl("/notifications/stream"));

    source.addEventListener("notification", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as Notification;
        onNotification(data);
      } catch {
        // malformed event — ignore, next one will still come through
      }
    });

    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
