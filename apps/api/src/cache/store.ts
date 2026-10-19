// apps/api/src/cache/store.ts
//
// The minimal surface the cache helper needs from a key-value store. Two
// implementations: Redis over Upstash's REST API (shared by every serverless
// instance) and a small in-memory fallback (per process).
export interface CacheStore {
  /** "redis" or "memory" - for logs and diagnostics. */
  readonly kind: "redis" | "memory";
  get(key: string): Promise<string | null>;
  /** Stores `value` for `ttlSeconds`. */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Atomically increments a counter (created at 0) and returns the new value. */
  incr(key: string): Promise<number>;
}
