import { apiClient } from "@/services/api.client";
import type { CalendarEvent } from "../types/calendar.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const CalendarRepository = {
  /** Events whose date falls in [from, to] (YYYY-MM-DD, inclusive). */
  async listEvents(from: string, to: string): Promise<CalendarEvent[]> {
    return unwrap<CalendarEvent[]>(apiClient.get(`/calendar/events?from=${from}&to=${to}`));
  },
};
