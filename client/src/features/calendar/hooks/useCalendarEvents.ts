import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { CalendarRepository } from "../repositories/calendar.repository";

/**
 * Events for one visible window. The key carries the range, so each month is cached
 * on its own and the last month stays on screen while the next one loads.
 */
export function useCalendarEvents(range: { from: string; to: string }) {
  const query = useQuery({
    queryKey: qk.calendar.events(range.from, range.to),
    queryFn: () => CalendarRepository.listEvents(range.from, range.to),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
  });
  return {
    events: query.data ?? [],
    /** First load only: nothing to show yet. */
    loading: query.isPending,
    /** A different window is loading behind data that is already on screen. */
    refreshing: query.isFetching && !query.isPending,
    error: (query.error as Error | null) ?? null,
    retry: () => void query.refetch(),
  };
}
