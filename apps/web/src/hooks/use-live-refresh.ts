// Calls `refresh` when the tab comes back into view and every `ms` while it is visible, so a screen
// that loads with useEffect (not TanStack Query, which polls through the query client) still follows
// changes other users make. Hidden tabs do nothing.
import { useEffect, useRef } from "react";

export const LIVE_REFRESH_MS = 15_000;

export function useLiveRefresh(refresh: () => void, ms = LIVE_REFRESH_MS) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    const timer = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [ms]);
}
