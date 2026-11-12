import { useEffect } from "react";
import { streamUrl } from "@/services/api.client";
import { getToken } from "@/auth/session";
import type { Notification } from "../types/notification.types";

/**
 * C1: opens the SSE connection to /notifications/stream and calls
 * onNotification for each pushed event. A supplement to, not a replacement
 * for, the existing refetch-on-popover-open in notification-bell.tsx — if
 * the stream is ever down, opening the bell still shows the current state.
 */
export function useNotificationStream(onNotification: (notification: Notification) => void) {
  useEffect(() => {
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 5_000;

    const connect = () => {
      if (!getToken()) return; // signed out: nothing to listen to
      // A new url each time, so a reconnect carries the current token, not the one from page load.
      source = new EventSource(streamUrl("/notifications/stream"));
      source.onopen = () => {
        delay = 5_000;
      };
      source.addEventListener("notification", (event) => {
        try {
          onNotification(JSON.parse((event as MessageEvent).data) as Notification);
        } catch {
          // malformed event — ignore, next one will still come through
        }
      });
      // The browser gives up for good when the server answers with an error (a restart, a sleeping host),
      // so reconnect ourselves, waiting longer each time up to a minute.
      source.onerror = () => {
        source?.close();
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 60_000);
      };
    };
    connect();

    return () => {
      clearTimeout(retry);
      source?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
