// apps/api/src/middleware/request-context.ts
//
// Per-request scratch space, reachable from anywhere in the call stack without
// threading `res` through services: the cache helper records HIT / MISS here,
// the timing middleware reads it when the response headers are written.
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  /** Set by cache/cached(): the outcome of the cache lookup for this request. */
  cache?: "HIT" | "MISS" | "BYPASS";
  /** Extra Server-Timing entries ("name;dur=12.3"), appended after `total`. */
  timings: string[];
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(fn: () => T): T =>
  storage.run({ timings: [] }, fn);

export const requestContext = (): RequestContext | undefined => storage.getStore();

/**
 * Records a cache outcome for the current request. When one request touches
 * several cached reads, a MISS wins over a HIT (the response was not fully
 * served from cache) and BYPASS never overwrites either.
 */
export const noteCache = (status: "HIT" | "MISS" | "BYPASS") => {
  const ctx = storage.getStore();
  if (!ctx) return;
  if (ctx.cache === "MISS") return;
  if (status === "BYPASS" && ctx.cache) return;
  ctx.cache = status;
};

export const noteTiming = (name: string, durationMs: number) => {
  storage.getStore()?.timings.push(`${name};dur=${durationMs.toFixed(1)}`);
};
