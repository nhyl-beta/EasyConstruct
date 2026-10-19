# EasyConstruct — Performance architecture

Three tiers, unchanged: React client → Express API → Postgres (Neon). Performance work adds a cache between API and DB and a shared query cache in the client.

```
Browser (TanStack Query: dedupe, staleTime, keepPreviousData)
   │  GET /api/...?page&limit&query&sort
Express  ── request-id → timing (Server-Timing, X-Cache) → auth → route
   │            cached(domain, scope, ttl, loader)      writes → cacheInvalidation bumps versions
Cache store: Upstash REST (UPSTASH_REDIS_REST_URL/TOKEN) or per-instance memory fallback
   │  miss / store down
Postgres via one pooled `db` (`apps/api/src/core/db/connection.ts`)
```

## Cache convention
- Key: `ec:v1:<domain>:<scope>:<hash>`; version counter: `ec:v1:<domain>:ver`. The version is part of the key, so invalidation is one counter bump, never a key scan.
- Scope is `role:<role>` or `user:<id>` (`apps/api/src/core/cache/scope.ts`). Authentication and notifications are never cached.
- A store failure falls through to the DB (never an error to the caller). Without Upstash env vars the in-memory store is used (per serverless instance, so hits are less frequent; correctness is unchanged only within one instance, hence short TTLs).
- Writes (POST/PUT/PATCH/DELETE, non-4xx) bump versions before the response is sent (`cache/invalidate.ts`). Only attendance/employees/roles writes are narrow; every other write bumps all domains.

## TTLs and endpoints
| Endpoint | Domain / scope | TTL |
| --- | --- | --- |
| `GET /dashboard/summary` | dashboard / role or user | 45 s |
| `GET /dashboard/workforce`, `/workforce/board` | attendance / all | 30 s |
| `GET /projects` | projects / visibility scope | 60 s |
| `GET /proposals` | proposals / visibility scope | 60 s |
| `GET /employees` (list) | employees | see `employees/controller.ts` |
| attendance heatmap, `/hr/attendance/summary` | attendance / all | 15 s |
| workforce reports | reports / all | 60 s |
| `/payroll/owner-summary` | payroll / all | 30 s |
| workflow templates | workflows / all | 300 s |
| `/workflows/approvals/stats` | workflows / role or user | 20 s |
| roles | config / all | 300 s |
| `/lifecycle/my-actions`, `/lifecycle/impact` | lifecycle / user | 60 s |
| calendar | see `calendar/routes.ts` | |

## Reading the headers
- `X-Cache: HIT | MISS | BYPASS` – outcome of the cache lookup for that request.
- `Server-Timing: total;dur=…, db;dur=…` – browser devtools → Network → Timing. Slow requests (> threshold) are also logged with the request id.

## Add a cached endpoint
1. Wrap the loader: `await cached("<domain>", scope, ttlSeconds, loader, { query: req.query, deps: [...] })`.
2. If `<domain>` is new, add it to `CACHE_DOMAINS` in `apps/api/src/core/cache/invalidate.ts`; add a narrow entry to `NARROW_WRITES` only if the write provably touches that domain alone.
3. Use `visibilityScope`/`userScope` so one role's data is never served to another.
4. Add a test next to `apps/api/src/core/cache/*.test.ts`.

## Add an index
Append to `apps/api/sql/performance-indexes.sql` (`CREATE INDEX CONCURRENTLY IF NOT EXISTS`), run it one statement at a time outside a transaction, then `EXPLAIN ANALYZE` the query it targets. Do not use Drizzle migrations for these.

## Pagination
`apps/api/src/core/utils/pagination.ts`: `page` (1), `limit` (20, max 100), whitelisted `sort`; response adds `meta:{total,page,limit,pageSize,pages}`. Unpaged calls keep returning the old shape. Client: `apps/web/src/hooks/use-server-list.ts` (debounced search, filters, previous page kept while loading).

## Client query cache
`lib/query-client.ts` (defaults), `lib/query-keys.ts` (`["api", resource, …]`), `lib/query-invalidation.ts` (resource-affected map used by `apiClient` writes). The cache is cleared when the signed-in user changes.

## Slow work in a request (phase 6)
Not implemented. The only candidate, the proposal reference-price refresh, needs a status column to report progress (schema change, out of scope) and a `waitUntil` host hook. Design: the endpoint records a run row and returns 202, the work continues under `waitUntil`, the client polls the status. Left for the owner.
