# Deployment: Cloudflare Pages + Render + Filebase + Neon

The app is built to run on Cloudflare Pages (web), a Render Docker web service (API), Filebase (files and
backups) and Neon (Postgres). The same API image can later run on a client's own server with MinIO or local
disk instead of Filebase. Vercel stays as a rollback (see the end).

## Architecture

```
 Browser
   |  https://<site>.pages.dev            static SPA (apps/web build, _redirects, _headers)
   |
   |  https://<api>.onrender.com/api/*    different origin: CORS (single exact origin = CORS_ORIGIN),
   v                                      Authorization: Bearer <JWT>, EventSource ?token=<JWT>
 Cloudflare Pages ........................ no server code, no API proxy
 Render web service (1 instance, Docker)
   |-- Neon Postgres (DATABASE_URL, pooled endpoint)
   |-- Filebase bucket easyconstruct-files   (S3 API, private; files stored as "s3:<key>")
   |-- SMTP (Gmail) for email
 GitHub Actions
   |-- cron.yml   -> GET <API_URL>/api/cron/<job>   (Bearer CRON_SECRET)
   |-- backup.yml -> pg_dump Neon -> Filebase bucket easyconstruct-backups (db/neon-<date>.dump)
```

Files are never served by a public link. The browser calls `GET /api/uploads/file?url=...` with the token and
the API streams the bytes from the bucket.

## Environment variables

R = required, O = optional. S = secret (never commit, never put in the web build).

### Render (API service)

| Variable | R/O | S | Value / note |
| --- | --- | --- | --- |
| `NODE_ENV` | R | no | `production` (the Dockerfile already sets it) |
| `DATABASE_URL` | R | yes | Neon **pooled** connection string |
| `JWT_SECRET` | R | yes | long random string (the API refuses to start in production without it) |
| `CORS_ORIGIN` | R | no | exact origin of the Pages site, e.g. `https://easyconstruct.pages.dev` (no path, no trailing slash) |
| `APP_URL` | R | no | public URL of the Pages site (used in email links); defaults to `CORS_ORIGIN` |
| `TRUST_PROXY` | R | no | `1` (Render is one proxy hop; without it every user shares one IP in the sign-in limiter) |
| `DISABLE_SCHEDULER` | R | no | `true` (GitHub Actions runs the jobs) |
| `CRON_SECRET` | R | yes | same value as the GitHub secret; with it unset every `/api/cron/*` call is refused |
| `S3_ENDPOINT` | R | no | `https://s3.filebase.com` |
| `S3_REGION` | O | no | defaults to `us-east-1` |
| `S3_BUCKET` | R | no | `easyconstruct-files` |
| `S3_ACCESS_KEY_ID` | R | yes | Filebase key for the files bucket |
| `S3_SECRET_ACCESS_KEY` | R | yes | Filebase secret for the files bucket |
| `MAIL_USER`, `MAIL_APP_PASSWORD`, `MAIL_FROM` | O | yes (password) | email; without them mail features answer 503 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | O | yes | shared cache; in-memory cache is used when unset (fine for one instance) |
| `DB_POOL_MAX` | O | no | default 5 |
| `MAX_UPLOAD_MB` | O | no | default 100 |
| `BLOB_READ_WRITE_TOKEN` | **leave unset** | yes | with it unset, old Vercel Blob URLs answer "file not available" instead of calling Blob |

`PORT` is set by Render itself.

### Cloudflare Pages (build-time, not secret: they are baked into the bundle)

| Variable | R/O | Value |
| --- | --- | --- |
| `VITE_API_BASE` | R | API origin only, e.g. `https://easyconstruct-api.onrender.com` (no `/api`) |
| `VITE_API_URL` | R | API origin plus `/api`, e.g. `https://easyconstruct-api.onrender.com/api` |
| `VITE_FEATURE_AI` | O | `false` only if the API has `FEATURE_AI=false` |
| `NODE_VERSION` | O | `22` |

### GitHub Actions secrets (repository secrets)

| Secret | Used by | Note |
| --- | --- | --- |
| `API_URL` | cron.yml | API origin, no trailing slash, no `/api` |
| `CRON_SECRET` | cron.yml | same as Render |
| `DATABASE_URL` | backup.yml | Neon connection string (a read-only role is enough for `pg_dump`) |
| `BACKUP_BUCKET` | backup.yml | `easyconstruct-backups` |
| `S3_ENDPOINT` | backup.yml | `https://s3.filebase.com` |
| `S3_REGION` | backup.yml | `us-east-1` |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | backup.yml | Filebase key scoped to the backups bucket |

## Render settings

- New **Web Service**, runtime **Docker**, Dockerfile path `infra/docker/api.Dockerfile`, Docker build context = repo root (`.`).
- Health check path `/api/health`. Instances: **1** (notification streams and rate limits live in memory).
- Auto-deploy from `thesis-final-staging` (or the branch you promote), env vars as above.
- The free plan sleeps after idle time. The first request after a sleep takes a while to answer; the cron workflow retries
  for that reason, and open notification streams reconnect on their own. Upgrade the plan if that is not acceptable.
- Migrations are **not** run on start. Apply them from a developer machine against the right database:

  ```bash
  DATABASE_URL='<neon url>' npm run db:migrate --workspace=@easyconstruct/api
  ```

  (`--dry-run` lists what would run.) The production image cannot do it: it ships compiled code only, not `tsx` entry
  scripts such as `scripts/ops/migrate.ts`. A brand-new empty database is built with `npm run db:bootstrap` instead
  (some early migrations cannot run on a fresh database).

## Cloudflare Pages settings

- Framework preset: none. Root directory: repo root (the workspace install needs it).
- Build command (CI also needs the Linux native packages that the lockfile only holds for Windows):

  ```bash
  npm ci && npm install --no-save --workspace=@easyconstruct/web @rollup/rollup-linux-x64-gnu@4.62.2 lightningcss-linux-x64-gnu@1.32.0 @tailwindcss/oxide-linux-x64-gnu@4.3.1 && npm run build:client
  ```

- Build output directory: `apps/web/dist`.
- `apps/web/public/_redirects` (SPA fallback) and `_headers` (the same five headers as `vercel.json`) are copied into the build.

## Jobs

`DISABLE_SCHEDULER=true` turns off both in-process schedulers (`startScheduledJobs`, `startOverdueSweeper`).
`.github/workflows/cron.yml` replaces them:

| Cron (UTC) | Route | Replaces |
| --- | --- | --- |
| `0 22 * * *` | `/api/cron/signals` | signal scan |
| `0 11 * * *` | `/api/cron/attendance-exceptions` | attendance check |
| `0 1 * * *` | `/api/cron/overdue` | overdue digest, RFI/RFA and workflow-stage sweep |
| `30 * * * *` | `/api/cron/design-requests-sweep` | hourly RFI/RFA overdue notifications |

All four are safe to run twice: each takes a Postgres advisory lock, signals reconcile rather than append, attendance
and overdue notices are de-duplicated per day, and the sweep marks `overdue_notified_at`. (Advisory locks assume one
API instance and a session-capable connection; with one instance a duplicate call just does nothing extra.)
A job can also be started by hand from the Actions tab (`workflow_dispatch`).

## Backups and restore

`backup.yml` runs weekly (Sundays 20:00 UTC) and on demand: `pg_dump --format=custom --no-owner`, checks the dump is not
tiny and `pg_restore --list` shows tables, uploads `db/neon-<UTC date>.dump` to `easyconstruct-backups`, attaches the
dump as a workflow artifact for 14 days, then keeps the newest 8 under `db/`. The `postgresql-client` major version in
the workflow (`PG_MAJOR`) must match the Neon server.

Restore:

1. Download the dump (`aws s3 cp s3://easyconstruct-backups/db/neon-YYYY-MM-DD.dump . --endpoint-url https://s3.filebase.com`, or from the workflow artifact).
2. Create a **fresh Neon branch or database** (never restore over the live one).
3. `pg_restore --no-owner --dbname '<new connection string>' neon-YYYY-MM-DD.dump`
4. Point `DATABASE_URL` at it (or copy the data you need back), then redeploy.

## Offline copy of the files bucket

The database dump does not contain files. Once real files exist, copy the bucket to a disk the owner controls each month:

```bash
aws s3 sync s3://easyconstruct-files ./easyconstruct-files-YYYY-MM --endpoint-url https://s3.filebase.com
```

## Existing Vercel Blob files are not migrated

The new bucket starts empty. Nothing copies or rewrites old files or old database URLs. Records that still point at a
Vercel Blob file (or an old `/uploads/...` path) will show a missing file until the data is reset and new example data
is created. With `BLOB_READ_WRITE_TOKEN` unset on Render, such a file answers 404 "This file is not available on this
server". Old URLs stay readable through their adapters wherever the token (or the old disk) is still present, which is
what keeps the Vercel rollback working.

## Rollback to Vercel

`apps/web/vercel.json`, `apps/api/vercel.json` and the Blob adapter are unchanged. To roll back: unpause the Vercel
projects (or raise their limits), point users at the Vercel URL, and keep `CORS_ORIGIN` on the API matching it. Files
uploaded to Filebase since the move are stored as `s3:<key>`; Vercel can only open them if the `S3_*` variables are also
set there. Setting them on the Vercel API project keeps those files readable, but it also makes uploads use the stream route, which Vercel's request size limit (about 4.5 MB) cuts short; treat that as read-only access.

## Owner actions (not done by the code change)

1. Create the Filebase buckets `easyconstruct-files` and `easyconstruct-backups` (both private) and one access key for each.
2. Create the Render service (settings above) and set its environment variables.
3. Create the Cloudflare Pages project (settings above) and set `VITE_API_BASE` / `VITE_API_URL`; then set `CORS_ORIGIN` and `APP_URL` on Render to the Pages URL.
4. Add the GitHub repository secrets listed above; run **Scheduled jobs** and **Weekly database backup** once by hand to check them.
5. Optionally take a `pg_dump` before resetting data, then reset and create the new example data.
6. Confirm the Neon major version and set `PG_MAJOR` in `backup.yml`.
