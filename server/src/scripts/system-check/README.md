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
All need the same local throwaway DB + API (8123) + Vite (5173) and `playwright` installed. Several have `/tmp/claude-0/...` paths from the original sandbox at the top: adjust. They write to / delete from the throwaway DB.
- `action-check.mjs` - presses approve/reject/confirm/delete/send buttons for every role.
- `expense-probe.mjs` - Finance "Record expense" end to end (adds a vendor first).
- `mobile-layout-check.mjs` - 390x844 touch viewport, all roles: sideways scroll, menu, tap targets.
- `attendance-scenarios.mjs` - emulated GPS inside/outside geofence, photo upload, offline queue + auto-sync.
- `attendance-sync-conflict.mjs` - sync latency and the duplicate-in-queue case.
- `smtp-sink.py` + `mail-check.mjs` - start the sink (`python3 smtp-sink.py`), start the API with `MAIL_USER=a@b.c MAIL_APP_PASSWORD=x MAIL_HOST=127.0.0.1 MAIL_PORT=2525`, then run mail-check (forgot password, reset, owner recovery, sign-out).
