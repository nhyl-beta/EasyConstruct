# Hosting prep progress (Cloudflare Pages + Render + Filebase)

Branch `thesis-final-staging`. Code and repo config only: nothing was deployed, no account was created, no real
database or storage was touched. All tests ran with a dummy `DATABASE_URL` that is never connected to.
Deployment guide: [docs/architecture/deployment.md](../architecture/deployment.md).

## What changed, by file

| Area | Files |
| --- | --- |
| Dependencies | `apps/api/package.json`, `package-lock.json` (`@aws-sdk/client-s3`, `@aws-sdk/lib-storage` only) |
| Health | `core/http/health.ts` (+ test), `app.ts` (registered before CORS, logger and auth) |
| Proxy | `app.ts` (`trust proxy` from `TRUST_PROXY`, default 0), `core/config/env.ts`, `design-requests/public-reply-routes.ts` (uses `req.ip` when a proxy is trusted instead of the spoofable raw `X-Forwarded-For`) |
| CORS | `core/config/cors.ts`: also exposes `Content-Disposition`, `Content-Length` |
| SSE | `notifications/stream.ts` (`open`, heartbeat, `closeAll`, + test), `notifications/controller.ts` |
| S3 adapter | `core/storage/s3.adapter.ts`, `core/storage/index.ts` (URL router, + `storage-router.test.ts`), `core/config/env.ts` (`S3_*`, `isS3Configured()`) |
| Uploads | `uploads/controller.ts` (`config` mode, `uploadStreamed` S3 path), `uploads/service.ts`, `documents/documents/service.ts` and `controller.ts` (multipart document upload now goes to S3), three zod validators (`design-requests`, `requirements`, `revisions`) accept `s3:easyconstruct/...` |
| Web | `lib/file-url.ts` (`s3:` URLs go through the authenticated download route), `public/_redirects`, `public/_headers`, `.env.example` |
| Jobs | `platform/jobs/routes.ts` (+ `/design-requests-sweep`, + `routes.test.ts`), `design/index.ts` (exports `runOverdueSweepOnce`) |
| Lifecycle | `main.ts` (SIGTERM/SIGINT, 10 s force exit, keep-alive timeouts), `core/db/connection.ts` (exports `pool`) |
| Docker | `infra/docker/api.Dockerfile` (HEALTHCHECK), `.dockerignore` (new), `infra/compose/docker-compose.yml` (`minio-init`, profile `s3`) |
| CI | `.github/workflows/cron.yml`, `backup.yml` (new; `ci.yml` untouched) |
| Docs | `docs/architecture/deployment.md`, `README.md`, `apps/api/.env.example` |

## Decisions and why

- **Storage routing.** `put`/`putFile` pick S3, else Blob (token set), else disk. `open`/`delete`/`exists` pick by URL, `s3:` first, because the Blob adapter's `open` falls back to local disk for non-Blob URLs. A Blob URL with no token is a 404 `FILE_NOT_AVAILABLE`, not a crash.
- **`s3:` keys are restricted** to `easyconstruct/...` without `..`, because the URL arrives from the client on `GET /uploads/file?url=`. Otherwise anyone signed in could read any object in the bucket.
- **Upload `config` returns `mode: "disk"` when S3 is configured**, so the web app's existing multipart path is used with no upload-flow change. The only web change is `file-url.ts`: before it, an `s3:` URL was treated as a "legacy public URL" and fetched without a token.
- **Multipart document upload** (`POST /documents/upload`, also used by workflows) was not in the brief, but it wrote to the container's disk, which Render wipes on deploy. With S3 configured it now uploads to the bucket like the generic route. Without S3 nothing changes. The workflow attachment route already used `storage.put` and needed no change.
- **`TRUST_PROXY` is a hop count** (integer), default 0.
- **RFI/RFA sweep.** `/api/cron/overdue` already runs `sweepOverdue` inside the daily digest, but the in-process sweeper ran hourly. A separate `/api/cron/design-requests-sweep` (hourly in `cron.yml`) keeps that cadence. It reuses `runOverdueSweepOnce`.
- **DB pool.** `connection.ts` already had `DB_POOL_MAX` (default 5), idle timeout 10 s and connection timeout 10 s, so only the `pool` export was added.
- **Scheduler flag.** `startScheduledJobs` and `startOverdueSweeper` both already honor `DISABLE_SCHEDULER=true`; no fix needed.
- **Cron route auth.** Already GET + `Authorization: Bearer`, `timingSafeEqual`, refuses (403) when `CRON_SECRET` is unset. Now covered by a test for all four routes.
- **Migrations in the image.** The production image cannot run `npm run db:migrate` (compiled output only, no `scripts/`). The command to run from a developer machine is in the deployment guide.
- **Workflow secrets** are passed through step `env:` rather than interpolated into the script text.

## Jobs and running twice

All four are safe to run twice: signals reconcile (create/reopen/resolve) under an advisory lock; attendance notice is de-duplicated per day; overdue emails go once per item per person per day; the sweep sets `overdue_notified_at`. Advisory locks assume one API instance.

## File-URL consumers audited

Changed: `uploads/controller.ts` (`config`, `uploadStreamed`), `documents/documents/service.ts` and `controller.ts` (`upload`), validators in `design-requests/validators.ts`, `projects/requirements/validators.ts`, `projects/revisions/validators.ts`, `core/storage/index.ts`, web `lib/file-url.ts`.

Checked, no change needed:
- `uploads/service.ts`: `uploadFile`/`storeBuffer` go through `storage.put`; `openStoredFile` now just calls `storage.open` (its Blob-token check moved into the router); `deleteStoredFile` uses `storage.delete`.
- `uploads/finance-files.ts`: looks up by exact URL string (expenses, procurement orders, claims); URL shape is irrelevant.
- `uploads/file-context.ts`: exact-match lookup on `documents.fileUrl`.
- `uploads/sniff.ts`: reads local temp files and buffers only.
- `uploads/integrity/*`: `recordBuffer`/`recordFromDisk` store whatever URL they are given; `verifyStored` and `recordFromBlob` open through `openStoredFile`.
- `uploads/stream.ts`, `documents/documents/upload.ts`: multer temp files on disk (now temp-only when S3 is on).
- `uploads/download-audit.ts`: derives the file name from the URL's last segment; works for `s3:easyconstruct/<ts>-name`.
- `design-requests/public-reply-routes.ts` / `public-reply.ts`: store with `storeBuffer`, read with `openStoredFile`.
- `workflows/controller.ts` (`uploadAttachment`): uses `storeBuffer`.
- `documents/validators.ts`, `issues/validators.ts`, `workflows/validators.ts`, `designs/validators.ts`: file URL fields are plain `z.string()` (`.max(500)`), no shape check.
- `isStoredBlobUrl` callers: only `core/storage/*` now.
- Export/ZIP code: grep found none that reads stored files.
- Scripts (`scripts/demo/*`, `scripts/ops/system-check/*`): call the HTTP routes only. They were not run.
- Web: `lib/file-url.ts` (fixed), `file-preview-dialog.tsx`, `submitted-files.tsx`, `FileIntegrityBadge.tsx` all go through `isRealFileUrl`/`fetchFileBlob`. `streamUrl()` already builds from the absolute `VITE_API_BASE` (`new URL(apiUrl(path), origin)` ignores the origin when the path is absolute), so no fix was needed. `public/sw.js` only handles Background Sync; it caches and intercepts nothing. The only raw `fetch` outside `apiClient` is the geocoder (third-party) and the legacy-public-URL branch.

## Commands run and results

| Command | Result |
| --- | --- |
| `npm ci` | **Not run**: it would wipe the working `node_modules`; CI runs it. Dependencies were added with `npm install --workspace=@easyconstruct/api`. The Linux native packages are still in the lockfile (15 `linux-x64-gnu` entries before and after). |
| `npm run lint --workspace=@easyconstruct/api` | 0 errors, 63 warnings |
| `npm run lint --workspace=@easyconstruct/web` | 0 errors, 36 warnings |
| `npm test --workspace=@easyconstruct/api` | 943 passed, 0 failed (baseline 931, plus the new tests) |
| `npm test --workspace=@easyconstruct/web` | 332 passed, **1 failed**: see below |
| `npm run build:server` | passed |
| `npm run build:client` | passed (existing chunk-size warning); `_redirects` and `_headers` present in `apps/web/dist` |
| `npm run typecheck --workspace=@easyconstruct/web` | passed |
| API `tsc --noEmit` | 0 `error TS` (baseline 0) |
| Fake-S3 smoke script (real AWS SDK against a local HTTP stub) | `put`, `open`, `putFile`, `open` of the streamed file, `delete`, then 404: all passed |
| API started locally (dummy DB URL, `TRUST_PROXY=1`, `DISABLE_SCHEDULER=true`) | `GET /api/health` 200 `{"ok":true}`; unauthenticated `GET /api/uploads/config` 401 |

The one web failure is `config/pagination-exempt.test.ts`. It flagged `components/responsive/responsive-table.tsx`, which was untracked at the time. **Correction:** the owner has since committed that file (`aec0453 deployment prep`), so the failure was no longer limited to the local tree and would have failed CI. Fixed in the follow-up pass below.

The root `package-lock.json` was already modified (some `"dev": true` flags removed) when this work began. Those edits were committed together with the AWS SDK additions in the dependency commit; revert that part if it was unintended.

## Not verified

- **Docker**: the Docker daemon was not running, so the API image was not built, the `HEALTHCHECK` was not exercised and the compose `minio-init` service was not started.
- **No local Postgres and no MinIO**, so login, a real upload/download/integrity check/delete through the HTTP routes, and the large (multipart) upload were not run. Covered instead by unit tests (routing, keys, cron auth, SSE) and the fake-S3 SDK script, which only used a 100 KB file, so SDK multipart behavior for files over 5 MB is untested.
- **SIGTERM/SIGINT shutdown**: `main.ts` compiles and starts, but the shutdown sequence was not observed on Windows.
- **The GitHub workflows** were not run (YAML written, not linted by GitHub). The `postgresql-client` install uses the PGDG apt repo and `PG_MAJOR=17` is a guess until the Neon version is confirmed.
- **CORS from a real Pages origin**, EventSource across origins, and Render's proxy behavior.
- `npm ci` from clean (see above).

## Open questions

1. What Postgres major version is the Neon project on? `backup.yml` assumes 17 (`PG_MAJOR`).
2. Is the free Render plan acceptable? It sleeps when idle, which delays the first request and open notification streams drop then. The cron workflow retries to absorb the wake-up.
3. Should `s3:` read access also be set on Vercel for rollback? That makes Vercel uploads use the stream route, limited to about 4.5 MB (documented in the guide). Safest default chosen: not set.
4. The web `.env` that exists in `apps/web` was not touched or read beyond its variable names. `VITE_API_URL` there should be set for the Pages build; the Refine data provider uses it and defaults to the same-origin `/api`.
5. `uploads/client-token` and `@vercel/blob` were left in place as asked; with `BLOB_READ_WRITE_TOKEN` unset the route answers 501.

## Owner actions still needed

1. Create the one Filebase bucket (private) and a key. (Superseded: first pass assumed two buckets; see the follow-up pass.)
2. Create the Render service (Docker, `infra/docker/api.Dockerfile`, repo-root context, health path `/api/health`, 1 instance) and set its environment variables, including `DISABLE_SCHEDULER=true`, `TRUST_PROXY=1`, and **no** `BLOB_READ_WRITE_TOKEN`.
3. Create the Cloudflare Pages project (build command and output directory are in the guide) with `VITE_API_BASE` and `VITE_API_URL`; set `CORS_ORIGIN` and `APP_URL` on Render to the Pages URL.
4. Add GitHub repository secrets: `API_URL`, `CRON_SECRET`, `DATABASE_URL`, `BACKUP_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`; then run both workflows once by hand.
5. Optionally take a `pg_dump` before resetting the data, then reset and create the new example data (old Blob-backed records will show missing files until then).
6. Apply pending migrations from a developer machine before the first deploy (command in the guide).

## Follow-up pass (fix-ups before deployment)

| # | Change | Files |
| --- | --- | --- |
| 1 | `responsive-table.tsx` added to the pagination exemptions. Its only text match is its own file: no page imports it yet, so the "caller paginates" reason is a rule for future callers, not something verified. `npm test --workspace=@easyconstruct/web` now passes. | `apps/web/src/config/pagination-exempt.ts` |
| 2 | Mail that works on Render: new `MAIL_REQUIRE_TLS` (default false, passes `requireTLS: true`), 10 s connection/greeting/socket timeouts, From = `MAIL_FROM` when set (it already was; an empty value now also falls back correctly), generic error text. Gmail defaults unchanged (465, `secure` only on 465). Tests mock nodemailer: Gmail defaults, 2525 + `MAIL_REQUIRE_TLS=true` gives `secure:false, requireTLS:true`, From, `MAIL_SEND_FAILED`. No HTTP-API mail path (documented as the fallback). | `core/mail/mailer.ts`, `mailer.test.ts`, `core/config/env.ts`, `.env.example`, `deployment.md` |
| 3 | `requestChecksumCalculation` and `responseChecksumValidation` set to `WHEN_REQUIRED` (installed `@aws-sdk/client-s3` is 3.1155.0, which supports both). `AWS_REQUEST_CHECKSUM_CALCULATION` / `AWS_RESPONSE_CHECKSUM_VALIDATION` set for the AWS CLI in `backup.yml` (workflow-level `env`, so every step) and documented. `forcePathStyle: true` kept; no endpoint or region hard-coded. | `s3.adapter.ts`, `backup.yml`, docs |
| 4 | One bucket: app files under `easyconstruct/`, backups under `db/`, `BACKUP_BUCKET` = `S3_BUCKET`. Prune lists only `db/neon-*.dump` and keeps the newest 8. Endpoint/region examples now say to copy them from the Filebase dashboard. Free plan limits noted. | `backup.yml`, `.env.example`, `deployment.md`, README, this doc |
| 5 | Removed the artifact upload of `neon.dump` (public repo). Added a final `if: always()` step that deletes the dump from the runner. No step prints the connection string. | `backup.yml`, docs |
| 6 | `PG_MAJOR` stays a single commented variable; new "Check server version" step runs a read-only `SHOW server_version_num` and fails with a clear message on a mismatch (prints only version numbers). | `backup.yml` |
| 7 | CORS: grep of `apps/web/src` found only GET, POST, PATCH, DELETE, the `Content-Type`, `Authorization` headers (and `X-Request-ID` allowed) and no PUT, `If-Match`, `Idempotency`, or `Range` request headers, so **no CORS change was needed**. Added preflight tests for each method and header, for a foreign origin (no `*`, no echo) and for exposed response headers. | `core/http/cors.test.ts` |
| 8 | `cron.yml`: re-checked each schedule maps to its route (`0 22` signals, `0 11` attendance-exceptions, `0 1` overdue, `30 *` design-requests-sweep) and that `workflow_dispatch` takes the same four names; added the 60-day inactivity comment. `deployment.md`: optional `NODE_VERSION=22` and the apex domain / nameserver note. | `cron.yml`, `deployment.md` |

### Verification of this pass

See the table in the final report message; results are recorded below once run.
