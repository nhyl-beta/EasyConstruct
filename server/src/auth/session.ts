// Pure session rules (no database): when a token counts as signed out, and which requests may
// carry the token in the query string.

/** The later of the account's "sessions before this are void" instants, in ms, or null. */
export function sessionCutoff(changedAt: number | null, validAfter: number | null): number | null {
  if (changedAt === null) return validAfter;
  if (validAfter === null) return changedAt;
  return Math.max(changedAt, validAfter);
}

/**
 * A token is signed out when it was issued (iat, whole seconds) before the cutoff, compared at
 * whole-second resolution so a sign-in in the same second as a sign-out still works.
 */
export function isTokenSignedOut(iatSeconds: number | undefined, cutoffMs: number | null): boolean {
  if (cutoffMs === null || typeof iatSeconds !== "number") return false;
  return iatSeconds * 1000 < Math.floor(cutoffMs / 1000) * 1000;
}

/**
 * ?token= exists because EventSource cannot set an Authorization header. It is accepted for the
 * notification stream only; every other route needs the Authorization header (a token in a URL
 * ends up in logs and history).
 */
export const QUERY_TOKEN_ROUTES: readonly string[] = ["/api/notifications/stream"];

export function allowsQueryToken(method: string, path: string): boolean {
  return method === "GET" && QUERY_TOKEN_ROUTES.includes(path.replace(/\/+$/, ""));
}
