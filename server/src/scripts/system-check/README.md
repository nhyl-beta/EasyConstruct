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
