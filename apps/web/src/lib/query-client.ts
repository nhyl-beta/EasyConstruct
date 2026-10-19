// apps/web/src/lib/query-client.ts
//
// The one TanStack Query client for the app (also handed to Refine, so Refine's
// own queries share it). Freshness is decided per kind of data, below; reading a
// cached value is instant, the refetch happens in the background once it is
// older than its staleTime.
import { QueryClient } from "@tanstack/react-query";

export const STALE = {
  /** Lists and tables: a minute-ish of freshness matches the server's 60 s cache. */
  list: 30_000,
  /** Dashboard summaries (the server caches them for 45 s). */
  summary: 45_000,
  /** Small counters shown on every page (sidebar badge). */
  badge: 20_000,
  /** Configuration that changes rarely: roles, workflow templates. */
  config: 5 * 60_000,
  /** Always refetch on mount: notifications and anything that must be live. */
  live: 0,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE.list,
      gcTime: 10 * 60_000,
      // Data does not change because the tab got focus; writes invalidate what they touch.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        const status = (error as { status?: number } | undefined)?.status;
        // A 4xx will not get better by asking again.
        if (status !== undefined && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
    },
  },
});
