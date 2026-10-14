// server/src/auth/throttle.ts: pure, no I/O (objectives fix 1.5)
//
// Slows password guessing. After a few failed sign-ins for one account in a
// short window, further attempts are refused until the oldest failure ages out.
// The failures counted are the ones already recorded in the audit trail
// (auth/service.ts recordLoginAttempt), so the limit holds across serverless
// instances without a new table or a cache. A refused attempt is logged as
// "login-throttled", which does not count, so it cannot extend its own lockout.
//
// Trade-off, stated plainly: someone who knows an email address can make it
// refuse sign-ins for a while by failing on purpose. The window is short (15
// minutes) and the audit trail shows it happening.

export const LOGIN_THROTTLE = {
  maxFailures: 5,
  windowMinutes: 15,
} as const;

export interface ThrottleConfig {
  maxFailures: number;
  windowMinutes: number;
}

export interface ThrottleState {
  blocked: boolean;
  /** Seconds until another attempt is allowed (0 when not blocked). */
  retryAfterSeconds: number;
}

/**
 * `failureTimes` are the times of recent failed sign-ins for the account, any
 * order. Blocked when `maxFailures` or more fall inside the window ending now.
 */
export const throttleState = (
  failureTimes: Date[],
  now: Date = new Date(),
  cfg: ThrottleConfig = LOGIN_THROTTLE,
): ThrottleState => {
  const windowMs = cfg.windowMinutes * 60_000;
  const recent = failureTimes
    .map((t) => t.getTime())
    .filter((t) => now.getTime() - t < windowMs)
    .sort((a, b) => b - a);
  if (recent.length < cfg.maxFailures) return { blocked: false, retryAfterSeconds: 0 };
  // Allowed again once the failure that makes the count reach the limit ages out.
  const pivot = recent[cfg.maxFailures - 1]!;
  return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((pivot + windowMs - now.getTime()) / 1000)) };
};

export const throttleMessage = (state: ThrottleState): string => {
  const minutes = Math.ceil(state.retryAfterSeconds / 60);
  return `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your password.`;
};

/**
 * A coarse per-address limiter held in memory. It only slows bulk guessing from
 * one address within a single server instance; the account limit above is the
 * one that holds everywhere. Pure apart from the Map it is handed.
 */
export const hitLimiter = (
  hits: Map<string, number[]>,
  key: string,
  now: number,
  max: number,
  windowMs: number,
): boolean => {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  // Keep the map from growing without bound.
  if (hits.size > 5_000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return true;
};
