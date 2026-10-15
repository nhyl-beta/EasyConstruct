# system-check

Whole-system check for EasyConstruct. Replaces clicking through every role by hand.

| Script | What it covers |
|---|---|
| `inventory.ts` | Builds the list of every route (method + path) from the live Express app, so new routes are picked up automatically |
| `sweep.ts` | Every route x every role (10) + unauthenticated: no 5xx, no open routes, bad ids, empty/garbage bodies, role access matrix |
| `files.ts` | Upload PNG/PDF as every role, read back byte-for-byte; blocked type, oversize, bad data, path traversal, cross-role file reads |
| `ui-check.mjs` | Real browser, every role: loads every sidebar page, clicks every safe control, opens every dialog, tries empty then filled submit incl. file upload |
| `form-probe.mjs` | Drill-down for one form at a time (prints validation text and server responses) |
| `run-all.sh` | Runs the lot |

Safe by design: refuses any API that is not `localhost:8123` (see `demo-guard.ts`). Never point it at staging/prod data.

## Second pass (gaps closed)
All need the same local throwaway DB + API (8123) + Vite (5173) and `playwright` installed. Chrome comes from `CHROME_PATH` and database access goes through `lib.mjs` (see Windows below), so no path edits are needed. They write to / delete from the throwaway DB.
- `action-check.mjs` - presses approve/reject/confirm/delete/send buttons for every role.
- `expense-probe.mjs` - Finance "Record expense" end to end (adds a vendor first).
- `mobile-layout-check.mjs` - 390x844 touch viewport, all roles: sideways scroll, menu, tap targets.
- `attendance-scenarios.mjs` - emulated GPS inside/outside geofence, photo upload, offline queue + auto-sync.
- `lifecycle-walk.ts` - one new project Proposal -> Archived with real role actions, gate flips checked after each, Advance/Archive clicked in the browser (run with `SMOKE_BASE_URL=http://localhost:8123/api ALLOW_DEMO_RESET=true npx tsx ...`).
- `attendance-sync-conflict.mjs` - sync latency and the duplicate-in-queue case.
- `smtp-sink.py` + `mail-check.mjs` - start the sink (`python3 smtp-sink.py`), start the API with `MAIL_USER=a@b.c MAIL_APP_PASSWORD=x MAIL_HOST=127.0.0.1 MAIL_PORT=2525`, then run mail-check (forgot password, reset, owner recovery, sign-out).

## Windows / PowerShell (what works now)

One-time setup (throwaway Postgres in Docker, built with `drizzle-kit push`, NOT `db:migrate`: migrations 0006 and 0011 both create tables on a fresh database):
```powershell
docker run -d --name ec-check -p 5544:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=easyconstruct_check postgres:16
cd server
$env:DATABASE_URL = "postgresql://postgres@localhost:5544/easyconstruct_check"; $env:ALLOW_DEMO_RESET = "true"
npx drizzle-kit push --force
npm run db:seed
Copy-Item .env.check.example .env.check
```
The check API must NOT load `server/.env`: that file holds the real Vercel Blob token, and uploads from the checks would go to the real Blob store. `start-api.ps1` loads `.env.check` instead (no Blob token, no mail). The scripts refuse to run when the API reports upload mode `blob` (set `ALLOW_BLOB=true` only if that is intended).

Every session (API in one terminal, website in another, checks in a third; restarting the API also clears the sign-in limiter):
```powershell
# terminal 1, from server\
.\src\scripts\system-check\start-api.ps1
# terminal 2, from client\  (client\.env must contain VITE_API_BASE=http://localhost:8123)
npm run dev
# terminal 3, from server\
$env:DATABASE_URL = "postgresql://postgres@localhost:5544/easyconstruct_check"; $env:ALLOW_DEMO_RESET = "true"
$env:SMOKE_BASE_URL = "http://localhost:8123/api"
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
npx tsx src/scripts/system-check/inventory.ts system-check-out
npx tsx src/scripts/system-check/sweep.ts system-check-out/inventory.json system-check-out
npx tsx src/scripts/system-check/files.ts system-check-out
node src/scripts/system-check/ui-check.mjs system-check-out/ui
node src/scripts/system-check/action-check.mjs system-check-out/act
node src/scripts/system-check/expense-probe.mjs
node src/scripts/system-check/mobile-layout-check.mjs system-check-out/mobile
node src/scripts/system-check/attendance-scenarios.mjs
node src/scripts/system-check/attendance-sync-conflict.mjs
npx tsx src/scripts/system-check/lifecycle-walk.ts system-check-out/lc
```
Restart the API between the heavy scripts (sweep, ui-check, action-check): each signs in as every role, and the limit is 40 sign-ins per 15 minutes per address. A check that cannot sign in now stops with `Cannot sign in as ...` and exit code 2 instead of printing results that look fine.

Database access in the `.mjs` checks uses `docker exec -i ec-check psql ...` by default. To use another psql, set `PSQL_CMD` to a command that reads SQL on stdin, for example the old socket form:
```powershell
$env:PSQL_CMD = "psql -q -h /tmp -p 5544 -U postgres easyconstruct_check -At"
```
Outputs go to `system-check-out\` and `mob2\` (both git-ignored; `mob2` is created automatically).

If the seed stops at the sign-in limiter, restart the API and run the script it names again; every seed script is idempotent (`npm run demo:seed` = demo-employees, demo-seed-stages, then demo:seed-roles). A seed that needs a workflow template the database does not have (for example "Structural Requirement Request") skips that workflow and says so.

Known limitations the checks report rather than hide: an offline reload of the attendance page cannot render (no app shell is cached), so "queued item survives an offline reload" is reported as KNOWN-LIMITATION, not PASS.
