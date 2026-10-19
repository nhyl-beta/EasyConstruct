// apps/api/src/cache/index.ts
//
// Cache-aside with PostgreSQL as the only source of truth.
//
//   key     ec:v1:<domain>:<scope>:<hash>
//   version ec:v1:<domain>:ver       (a counter; its value goes into <hash>)
//
// Reading: get the version(s) of the domain (and any `deps`), build the key,
// GET it, and on a miss run the loader and SET the result with a TTL.
// Invalidating: a write INCRements the counter, so every key built from the
// old value is simply never asked for again - nothing is scanned or deleted.
//
// The cache must never fail a request: every store call is caught and logged,
// a failed read falls through to the loader, a loader error is rethrown
// untouched and nothing is stored for it.
import { createHash } from "node:crypto";
import { noteCache } from "../http/request-context.js";
import { MemoryCacheStore } from "./memory.js";
import type { CacheStore } from "./store.js";
import { UpstashCacheStore } from "./upstash.js";

export type { CacheStore } from "./store.js";
export { MemoryCacheStore } from "./memory.js";

export const KEY_PREFIX = "ec:v1";

/** Every successful write bumps this domain too; whole-system views (the dashboards) depend on it. */
export const ALL_DOMAIN = "all";

let store: CacheStore | undefined;

export const createStoreFromEnv = (env: NodeJS.ProcessEnv = process.env): CacheStore => {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new UpstashCacheStore(url, token);
  return new MemoryCacheStore();
};

export const getCacheStore = (): CacheStore => (store ??= createStoreFromEnv());

/** Test hook: swap the store. */
export const setCacheStore = (next: CacheStore | undefined) => {
  store = next;
};

// ── Failure reporting (one line per minute per operation, not per request) ───
const lastReport = new Map<string, number>();
const report = (op: string, err: unknown) => {
  const now = Date.now();
  if (now - (lastReport.get(op) ?? 0) < 60_000) return;
  lastReport.set(op, now);
  console.error(`[cache] ${op} failed (falling back to the database): ${err instanceof Error ? err.message : String(err)}`);
};

// ── Keys ────────────────────────────────────────────────────────────────────

export const versionKey = (domain: string) => `${KEY_PREFIX}:${domain}:ver`;

/** Deterministic JSON: object keys sorted, so the same query always hashes the same. */
export const stableStringify = (value: unknown): string => {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v) || "null").join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
};

export const buildKey = (domain: string, scope: string, query: unknown, versions: readonly (number | string)[]) => {
  const hash = createHash("sha1")
    .update(`${versions.join(".")}|${stableStringify(query)}`)
    .digest("hex")
    .slice(0, 20);
  return `${KEY_PREFIX}:${domain}:${scope}:${hash}`;
};

// ── cached() ────────────────────────────────────────────────────────────────

export interface CachedOptions {
  /** Request parameters the result depends on (hashed into the key). */
  query?: unknown;
  /** Other domains whose writes must also invalidate this entry. */
  deps?: readonly string[];
}

/**
 * Returns the cached value for (domain, scope, query) or runs `loader`, stores
 * its result for `ttlSeconds` and returns it. Records HIT / MISS / BYPASS for
 * the X-Cache response header.
 *
 * `scope` is part of the key: use `all` only when the loader's result is
 * identical for every caller that can reach this code; otherwise put the role
 * (`role:admin`) or the user (`user:42`) in it. See cache/scope.ts.
 */
export async function cached<T>(
  domain: string,
  scope: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  options: CachedOptions = {},
): Promise<T> {
  const cache = getCacheStore();
  let key: string | undefined;

  try {
    const domains = [domain, ...(options.deps ?? [])];
    const versions = await Promise.all(domains.map((d) => cache.get(versionKey(d))));
    key = buildKey(domain, scope, options.query, versions.map((v) => v ?? "0"));
    const hit = await cache.get(key);
    if (hit !== null) {
      noteCache("HIT");
      return JSON.parse(hit) as T;
    }
  } catch (err) {
    report("read", err);
    key = undefined;
    noteCache("BYPASS");
    return loader();
  }

  noteCache("MISS");
  const value = await loader(); // an error here propagates and is never cached
  if (key !== undefined && value !== undefined) {
    try {
      await cache.set(key, JSON.stringify(value), ttlSeconds);
    } catch (err) {
      report("write", err);
    }
  }
  return value;
}

/**
 * Invalidates a domain (and the system-wide `all` domain) after a write by
 * bumping its version counter. Never throws: if the store is down the entries
 * simply expire by TTL.
 */
export async function bumpVersions(...domains: string[]): Promise<void> {
  const cache = getCacheStore();
  const unique = [...new Set([...domains, ALL_DOMAIN])];
  try {
    await Promise.all(unique.map((d) => cache.incr(versionKey(d))));
  } catch (err) {
    report("invalidate", err);
  }
}
