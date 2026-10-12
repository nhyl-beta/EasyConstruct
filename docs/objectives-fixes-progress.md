# Objectives 1, 2, 3 fixes — progress

Branch: `staging` only. Baseline commit `3a34bc3` (Oct 12 2026). 20 fixes for Objectives 1, 2 and 3.
Rule-based decision support only: no language model, no external AI service. Every output is advice; it never blocks, approves, rejects or applies anything. A person decides.

**Status: all 20 in-scope fixes are built and committed on `staging`.** Nothing was run against real data and no screen was opened in a browser (see "Not verified").

## Not built on purpose

- **1.1 ORRA branding** — removed by the owner.
- **1.6 Email copies of notifications** — removed by the owner. Notifications stay in-app only.
- **Objective 4** (consolidated Reports hub, export, one-page project report, report charts and snapshots, impact cards on the Owner, IT Designer and Architect dashboards) — deferred. Nothing was built for it.

## Phase 0 baseline (before any change)

| Check | Result |
|---|---|
| Branch / commit | `staging` @ `3a34bc3`, clean tree |
| `tsc --noEmit` server / client | clean / clean |
| `npm --prefix server test` | 496 of 497 pass. The failure, `proposals/validate.test.ts` "flag off", came from the local `server/.env` setting `FEATURE_AI=true` while the test assumed it unset. Fixed in fix 3.6 by making the test set the flag itself. |
| `npm --prefix client test` (vitest) | 259 of 259 pass |

### Deployment model (rule 7)

- `server/index.ts` exports the Express app and calls `listen` only when `process.env.VERCEL` is unset. There was no `server/vercel.json` (only `client/vercel.json`). The server is therefore treated as **serverless**: in-process timers do not reliably tick.
- `design-requests/scheduler.ts` (`startOverdueSweeper`) uses `setInterval`. It is started from `server/src/index.ts` (the local entry), never from `server/index.ts`, and refuses to start when `VERCEL` is set. **On Vercel the RFI/RFA overdue job never runs by itself.** Its sweep is reachable only as `POST /api/design-requests/sweep`, which needs an Admin login and so cannot be called by Vercel Cron. **Reported, not fixed**, as instructed.
- Also noticed (not changed): that sweeper takes a session-level Postgres advisory lock with two separate queries on a pooled connection, so the unlock can land on a different connection than the lock. The new jobs use a transaction-level lock instead (`jobs/lock.ts`).
- Consequence: the scheduled jobs for fixes 2.3 and 3.5 are authenticated cron endpoints (`/api/cron/signals`, `/api/cron/attendance-exceptions`, secret in `CRON_SECRET`) plus a Vercel cron entry (`server/vercel.json`), with a local interval only for development (`jobs/scheduler.ts`, started from `src/index.ts`).

## Final verification

| Check | Result |
|---|---|
| `tsc --noEmit` server / client | clean / clean |
| `npm --prefix server test` | 699 of 699 pass (full-suite runs twice showed one timing-sensitive Upstash cache test fail under load; it passes alone, three times in a row, and is unrelated to these changes) |
| `npm --prefix client test` (vitest) | 266 of 266 pass |
| `npm --prefix server run build` | exit 0 |
| `npm --prefix client run build` (`tsc && refine build`) | exit 0 (the existing single-chunk size warning only) |
| `eslint` on `client/src` | 10 errors, all in files and lines this work did not add (unused variables, one `any`, one irregular space); every file this work added is clean. There is no server lint script. |
| Route smoke test | all 24 new routes answer 401/403 without a login, never 404, with the new security headers present and without touching the database |

## Fix status

Priority P1 = claim had no working feature, P2 = partly met or strengthens a met claim, P3 = evidence and polish.

| Fix | Pri | Status | Found before building | What was built | Tests added | Left / notes |
|---|---|---|---|---|---|---|
| **2.1** Rule-based task allocation | P1 | Done | Missing. Task creation is `NewTaskCard` inside `pages/roles/site-personnel/sp-tasks.tsx` (route `/tasks`, used by PM and Engineer), not only a site view. `employees.role` is the position; `employees.userId` links a login to an employee. | Pure `tasks/suggest.ts` (open tasks, due dates within 3 days, attendance in 14 days, position fit, exclusions, ties by id; weights in `ALLOCATION_CONFIG`). `GET /api/tasks/suggest-assignees`, `POST /api/tasks/suggest-allocation`; panel in the New task card; "Suggest assignees for unassigned tasks" review card. Nothing is written until a person assigns. | `tasks/suggest.test.ts` (11) | Candidates are Site Personnel staffed on the project with a linked Active employee (only they can advance a task). Others are listed as "left out" with the reason. |
| **2.2** Workload and overlap warning | P2 | Done | Missing | `assessAssignment` (same module); `GET /api/tasks/assignment-warnings`; create and update responses carry `warnings`; shown before and after save. Never blocks. | in `suggest.test.ts` | Also added `assertProjectVisible` to task create and update in the controller (it was not applied there). |
| **3.1** Suggested plan on an approved proposal | P1 | Done | Missing. Single completion point in `workflows/service.ts decideStage`. Milestones are created as drafts (rule C3). Documents carry no date, so the Notice to Proceed date is the filing date of the NTP document. | Tables `plan_suggestions`, `plan_suggestion_items` (migration `0027`). `plan-suggestion/` module: 6 project-type templates plus a Design template, constant responsibilities table, sequential dates from NTP else approval date, basis on every item. Endpoints `GET /api/plan-suggestions?projectCode`, `POST /:id/items/:itemId/accept\|discard`, `POST /:id/regenerate`. "Suggested plan" panel on the project page; in-app notice to the PM. Accepting creates real draft milestones and linked tasks through the existing services; responsibilities are a checklist. Regenerate never touches accepted items. | `plan-suggestion/plan.test.ts` (10) | A task can only be accepted after its milestone. One suggestion per proposal is enforced by a unique index (`ON CONFLICT DO NOTHING`); that part is not unit-testable without a database. Generation errors are logged and never fail the approval. |
| **3.2** Forecast the impact of a change | P1 | Done | Missing. No link exists between an RFI/RFA and a Change Order workflow. | Pure `forecast/change-impact.ts` (new total against contract, percent over, estimate at completion from task completion, projected overrun, slip and moved milestones, severity from `SIGNAL_THRESHOLDS`). `GET /api/workflows/:id/impact-forecast` (with a what-if `timeImpactDays`) and `GET /api/design-requests/:id/impact-forecast` using `mapRequestImpact` (cost enum plus the amount named in the cost note, time enum plus days). New signal rule `projected-finish` (28-day velocity against remaining tasks). Card in the approver dialog and `finance-impact-review.tsx`. | `forecast/change-impact.test.ts` (10), `signals/projected-finish.test.ts` (6) | The RFI/RFA stores no peso amount, only a free-text note, so the amount is read from "PHP 38,000" style text; when none is stated the cost is 0 and the card says so. |
| **3.6** Decision support on by default | P2 | Done | Flags defaulted off | `FEATURES.ai` is on unless `FEATURE_AI` / `VITE_FEATURE_AI` is `false`. Shared `DecisionSupportLabel` ("Decision support: a person decides") on every surface including the older ones (signals section, impact awareness, consultant validation, requirement structuring, similar issues, expense anomalies). `.env.example` and README updated. | `signals/flag.test.ts`; two flag-off tests now set the flag themselves | **This also turns on the existing EstimationPro cost-catalog lookups** that run when a budget change or change order is created (a price reference service, not an AI model, no key). Set `FEATURE_AI=false` to turn everything off. |
| **3.5** Scheduled issue detection with suggested resolutions | P2 | Done | Signals were only computed on request. `Signal` had no resolution field. | `Signal.suggestedResolution`, `signals/playbook.ts` (one action per rule), new rules `overdue-tasks` and `milestone-slip`, similar resolved issues attached to `issue-recurrence` (reuses `issues/precedents.ts`). Table `signal_findings` (migration `0028`). `signals/scan.ts` stores findings once per occurrence, resolves them when the condition clears, notifies owner roles once per new finding. Cron `GET\|POST /api/cron/signals`. Findings feed the PM queue (`my-actions`: first seen, suggested action, precedents) and the "Waiting on you" card on the dashboards. | `signals/findings.test.ts` (19) including the never-gates guarantee | Only warn and critical are stored. A condition that clears and returns is a new occurrence and notifies again. `lifecycle/boundary.test.ts` still passes. |
| **3.3** Deeper proposal validation | P2 | Done | Four basic checks only | `proposals/validation.ts` adds `version` and `basis`, amount against the median of past proposals of the project type (needs 3), amount against contract value, possible duplicates (same project, similar title, close amount, recent), required sections by project type. Recomputed when the stored version is older. Shared panel in the Consultant, Architect and read-only register views. | `proposals/validation.test.ts` (17) | Stored JSON stays backward compatible. Thresholds in `PROPOSAL_CHECKS`. |
| **3.4** Requirement drafts from templates | P2 | Done | Structuring existed; no templates | `requirements/templates.ts` (packs per category and project type, plus keyword items from the approved proposal and design text), `POST /api/requirements/generate-draft`, "Generate draft" button with Undo. Output uses the existing `StructuredRequirement` shape plus a basis. | `requirements/templates.test.ts` (12) | Read-only; the Engineer edits and saves through the normal flow. |
| **2.3** Attendance exception flags | P2 | Done | `POST /attendance/bulk-verify` existed; no exception view | `attendance/exceptions.ts` (missing clock-out, late, outside geofence, duplicates, missing photo, absent while a task is due, likely absent). `GET /api/attendance/exceptions` (HR, Admin), "Exceptions" tab, `POST /api/attendance/mark-absent` creates the record through the attendance service on HR's click only. Daily cron `/api/cron/attendance-exceptions` notifies HR once a day. Shift start, grace, working days and cut-off are env settings. | `attendance/exceptions.test.ts` (16) | The system never writes an absence by itself. |
| **2.4** Payroll pre-submit warnings | P2 | Done | `payroll/validation.ts` already blocked on errors and asked to confirm a duplicate batch | Extended it (not replaced): warnings for unverified attendance, hours outliers, pay-rate mismatch within a position, each needing an explicit tick. `acknowledgedWarnings` on submit; acknowledgements stored per round in a new table `payroll_batch_acknowledgements` (migration `0029`). Checklist in the HR payroll wizard. | `payroll/warnings.test.ts` (14) | Stored in a new table, not a column on `payroll_batches`, so existing payroll queries are untouched. API clients that create-and-submit in one call now need to pass `acknowledgedWarnings`. |
| **2.5** Calculation trace | P2 | Done (employee view removed) | Built, then the employee self-service half was removed by the owner's decision. | `payroll/trace.ts` and `GET /api/payroll/:id/trace` (steps, attendance rows, rate versions, recompute check); "Trace" drawer on HR and Finance payroll pages. The "My attendance and pay" page and its `/api/me/*` endpoints no longer exist. Claim 12 (fair and transparent management) now rests on the trace and the fairness report (2.6). | `payroll/trace.test.ts` (7) | No database object was dropped; this fix added none. `employees.user_id` and `db:backfill-employee-links` pre-date this work and are kept. |
| **2.6** Fairness report | P2 | Done | Only counts existed | `workforce-reports/fairness.ts`, `GET /api/workforce-reports/fairness` (HR, Admin), "Fairness" tab on the workforce reporting page: hours, overtime and tasks per worker per project, pay against the position median, flagged outliers. | `workforce-reports/fairness.test.ts` (10) | Read-only. |
| **1.2** Shared reference data and duplicate checks | P2 | Done | No vendors table exists (vendor is free text on expenses, purchase requests and orders), so `vendors` was added. | Tables `clients`, `vendors`, nullable `projects.client_id` (migration `0030`). Normalized-name uniqueness, `/api/reference/clients` and `/vendors`, `ReferencePicker` ("Add new") on New project and the vendor fields. Duplicate checks: employee id (existing) and name, vendor, project code (existing) and a similar project name; a similar name asks for confirmation. Backfill `npm run db:backfill-reference` (dry run by default, `--apply` to write, idempotent, never changes existing text). | `reference/names.test.ts` (9), `reference/backfill.test.ts` (5) | The text columns are kept. Projects link to a client by id when chosen, or when the text matches a client exactly after normalizing. |
| **1.3** Reconciliation panel | P2 | Done | Missing | `reconciliation/` (pure `checks.ts`): project progress, budget actual against approved expenses plus approved payroll, batch totals against lines, payroll hours against verified attendance, orphan tasks, milestones, members and attendance, members with a deactivated account. `GET /api/admin/reconciliation` (Admin, IT Designer, Owner), CLI `npm run reconcile`, panel on the System Oversight / Security page. | `reconciliation/checks.test.ts` (12) | Read-only; it reports and never repairs. Real data may fail checks; that is the point. |
| **1.4** Efficiency measures | P3 | Done | Missing | `GET /api/dashboard/cycle-times` from existing timestamps only (no migration): workflow approval by template, RFI/RFA response, payroll submit to approval, issue time to resolve, monthly averages. Card on the Owner and Admin dashboards. | `dashboard/cycle-times.test.ts` (6) | Issue time uses the issue's last update. |
| **1.5** Security and backup checklist | P3 | Done | Audited; see `docs/SECURITY_CHECKLIST.md` | Account login throttle (5 failures in 15 minutes, read from the audit trail), per-address limit, security headers on API and client, deactivated accounts' existing sessions now end, loud log if `JWT_SECRET` is missing. Token format untouched. | `auth/throttle.test.ts` (8), `middleware/security-headers.test.ts` (3) | Neon backup and restore window cannot be verified from code: owner step. 30-day token expiry and the password-rule inconsistency are recorded, not changed. |
| **2.7** Bulk actions and saved filters | P3 | Done | Bulk attendance verify already exists (button with count and confirmation on the HR attendance page) | Bulk "Approve selected" in the approval queue (each item decided through the normal per-stage endpoint, failures reported). Per-user saved filters in `localStorage` on HR attendance and HR employees. | `lib/saved-filters.test.ts` (6, client) | Bulk approve is a client loop over the existing endpoint; no new server rule. |
| **2.8** Payroll rule currency | P3 | Done | Finance review already printed `needsVerification` in one line | `GET /api/payroll/rules`, notice on the HR payroll and Finance payroll review pages: rate versions, unverified values, "not a certified payroll engine". | none (display) | |
| **3.7** Measure usefulness | P3 | Done | Missing | Table `decision_support_events` (migration `0031`), `POST /api/decision-support/events`, `GET /api/decision-support/summary` (Admin, Owner, IT Designer), "Is decision support useful?" card. Events recorded from assignee suggestions, allocation, plan items (server-side on accept and discard) and detected issues. | `decision-support/summary.test.ts` (6) | Stores the user id only, once per user, item and action. |
| **3.8** Tests and visible basis | P3 | Done | | Every new rule is a pure function with `node:test` tests; `decision-support/rules-coverage.test.ts` fails if a listed rule imports the database or has no test. Basis shown: assignee reasons and basis line, plan item basis, forecast basis list, validation basis list, draft basis, signal detail and suggested action, exception messages, fairness basis, reconciliation basis. | `rules-coverage.test.ts` (21) | |

## Decisions made without the owner

- Allocation candidates are Site Personnel staffed on the project with a linked Active employee record, because only they can advance a task's status.
- Task create and update now apply the project visibility rule (it was not applied in the controller).
- Plan suggestions: milestones are always drafts; a task is accepted only after its milestone; responsibilities are a checklist, never a permission.
- Forecast: the change is treated as extra scope on top of the trend estimate at completion; the schedule slip moves every open milestone by the same days.
- Payroll warning acknowledgements are stored in a new table, not on the batch.
- Employee view (2.5): removed by the owner's decision; only the calculation trace remains.
- Deactivating an account now also ends its existing sessions (a security fix found during the 1.5 audit).
- Turning decision support on by default also turns on the existing cost-catalog price lookups.

## Deviations from the brief and why

- **Vercel cron calls endpoints with GET**, so the cron endpoints accept GET and POST, authenticated by `Authorization: Bearer <CRON_SECRET>`; with no secret set they refuse everything.
- **`server/vercel.json` assumes the Vercel server project's root directory is `server/`.** If it is the repository root the cron entries must move there.
- **Fix 3.2 time impact:** a change-order workflow carries no schedule impact and nothing links it to an RFI/RFA, so the workflow forecast takes a what-if "days" input and the RFI/RFA forecast is its own endpoint.
- **Fix 2.4 table, fix 2.7 server rule, fix 1.2 auto-create:** see the decisions above and the table; none create data automatically.
- **`docs/` is git-ignored** (existing docs were force-added); the two docs from this work were force-added the same way.

## Manual steps for the owner

1. **Apply the migrations before deploying this branch.** `projects.client_id` is read by every projects query, so code that selects projects will fail until `0030` is applied. All five are additive and safe to run twice (`IF NOT EXISTS`): `0027_plan_suggestions` to `0031_decision_support_events`. See "How migrations are applied" below.
2. **Server environment (Vercel):** set `CRON_SECRET` (a long random string; Vercel sends it as the Bearer token on cron calls). Check `JWT_SECRET` is set to a long random value and `CORS_ORIGIN` is the real client URL. `FEATURE_AI` needs no change (now on); set `FEATURE_AI=false` to turn decision support off. Optional tuning variables are listed in `server/.env.example` (`ATTENDANCE_*`, `PAYROLL_*`).
3. **Client environment:** `VITE_FEATURE_AI` needs no change (now on); `VITE_FEATURE_AI=false` hides the surfaces.
4. **Vercel cron:** confirm the server project root is `server/` so `server/vercel.json` is read, and that the plan allows two cron jobs. Schedules: signals `0 22 * * *` UTC (06:00 Manila), attendance exceptions `0 11 * * *` UTC (19:00 Manila).
5. **Backfills (dry run first):** `npm --prefix server run db:backfill-reference` then `-- --apply`.
6. **Baseline the data checks:** `npm --prefix server run reconcile` (read-only) and note which checks fail on real data.
7. **Neon backup and restore:** fill in the checklist in `docs/SECURITY_CHECKLIST.md` section 7 (plan, restore window, restore drill).
8. **Not fixed, as instructed:** the RFI/RFA overdue sweep does not run on Vercel (needs a secret-authenticated GET endpoint and a cron entry).

## How migrations are applied

- `npm --prefix server run db:migrate` runs `src/scripts/migrate.ts`. It reads `server/drizzle/meta/_journal.json`, compares each migration's hash with `drizzle.__drizzle_migrations`, applies the missing ones in order (one transaction each) and prints `applied <tag>` per migration or `Nothing to apply`. `-- --dry-run` lists what would run and changes nothing. `-- --print-sql` prints the SQL of 0027 onward without a database.
- Cause of the earlier no-op: the journal was complete, but the database's `drizzle.__drizzle_migrations` table was empty (the schema had been built another way). `drizzle-kit migrate` decides by "newer than the latest recorded timestamp", so it cannot be trusted on a database like that. If the table is empty and the schema exists, `db:migrate` now stops and explains instead of guessing. Record the old migrations once with `-- --baseline-through=0026_expense_categories` (bookkeeping rows only, the old SQL is not run), then run `db:migrate`.
- `src/db/migrations.test.ts` fails when a `.sql` file has no journal entry, or the reverse, or the entries are out of order.
- Deploy order: **migrate first, then deploy.** The old tool is still available as `db:migrate:drizzle-kit`.

## Not verified (the app was not run against real data)

- No screen was opened in a browser and no endpoint was called with a login. Types, tests, builds and a route-mount smoke test passed; behaviour on real data is untested.
- The migrations were not applied to any database, so the SQL itself is unrun. The statements follow the same pattern as `0026`.
- Cron endpoints and `server/vercel.json` were not exercised on Vercel.
- The reconciliation checks, the fairness report, cycle times and the duplicate checks have only been tested on constructed rows; their results on the real database are unknown.
- Neon backup and restore (see the checklist).
