// Decides what to do with a queued attendance entry whose sync failed (pure).
//
//   retry           network error, timeout, 429 or 5xx: keep it queued, try again later
//   duplicate       the server already has a record for that day (409 ATTENDANCE_DUPLICATE):
//                   it can never succeed, so drop the queued entry and tell the person
//   needs-attention any other 4xx (validation, wrong project phase, not staffed...): keep it,
//                   show the server's message, and let the person discard it
export const DUPLICATE_ATTENDANCE_CODE = "ATTENDANCE_DUPLICATE";

export type SyncFailureKind = "retry" | "duplicate" | "needs-attention";

interface ApiErrorLike {
  status?: number;
  body?: { code?: string } | null;
  message?: string;
}

export function classifySyncFailure(err: unknown): SyncFailureKind {
  const e = (err ?? {}) as ApiErrorLike;
  const status = e.status;
  if (status === undefined || status === null) return "retry"; // fetch threw: offline, DNS, aborted
  if (status === 409 && e.body?.code === DUPLICATE_ATTENDANCE_CODE) return "duplicate";
  if (status >= 500 || status === 408 || status === 429) return "retry";
  return "needs-attention";
}

export const DUPLICATE_DROPPED_MESSAGE = "Already recorded for that day \u2014 the queued entry was dropped.";

export function failureMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Sync failed";
}
