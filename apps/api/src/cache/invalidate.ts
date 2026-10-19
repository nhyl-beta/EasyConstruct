// apps/api/src/cache/invalidate.ts
//
// Express middleware: after every write that did not fail on the client's side,
// bump the version counters of the cached domains it can have changed - before
// the response is sent, so the caller's very next read already misses.
import type { NextFunction, Request, Response } from "express";
import { bumpVersions } from "./index.js";

/** Every domain a cached endpoint is registered under. Add a new domain here when you cache a new kind of data. */
export const CACHE_DOMAINS = ["projects", "employees", "attendance", "payroll", "proposals", "workflows", "config", "reports"] as const;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Writes that provably touch only their own domain's cached reads. Anything
 * else (a task, an issue, a payroll decision, a lifecycle transition...) can
 * move a project's progress or status, so it invalidates every domain.
 */
const NARROW_WRITES: Array<{ prefix: string; domains: string[] }> = [
  { prefix: "/api/attendance", domains: ["attendance"] },
  { prefix: "/api/hr/attendance", domains: ["attendance"] },
  { prefix: "/api/employees", domains: ["employees"] },
  { prefix: "/api/hr/employees", domains: ["employees"] },
  { prefix: "/api/roles", domains: ["config"] },
];

export const domainsForWrite = (path: string): string[] => {
  const hit = NARROW_WRITES.find((w) => path === w.prefix || path.startsWith(`${w.prefix}/`));
  return hit ? hit.domains : [...CACHE_DOMAINS];
};

export function cacheInvalidation(req: Request, res: Response, next: NextFunction) {
  if (!WRITE_METHODS.has(req.method)) return next();

  const end = res.end.bind(res) as (...args: unknown[]) => Response;
  let ended = false;
  res.end = ((...args: unknown[]) => {
    if (ended) return end(...args);
    ended = true;
    // 4xx: the request was refused, nothing changed. Anything else may have.
    if (res.statusCode >= 400 && res.statusCode < 500) return end(...args);
    void bumpVersions(...domainsForWrite(req.originalUrl.split("?")[0] ?? "")).finally(() => end(...args));
    return res;
  }) as typeof res.end;
  next();
}
