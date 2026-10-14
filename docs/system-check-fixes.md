# System-check findings: fixes (branch `fix/system-check-findings`)

Built from `claude/system-check` with `prod` merged in. One commit per issue. See "Needs confirmation" first.

## Needs confirmation (owner decisions)

1. **Finance read policy (issue 5).** Implemented the default; flip it in `server/src/finance/access.ts`.
2. **Token lifetime (issue 3).** Tokens still last 30 days (`JWT_EXPIRES_IN` in `server/src/auth/service.ts`). Sign-out, password change and deactivation now revoke tokens, which removes most of the risk. A shorter life (8 to 12 hours) is proposed, not applied, because people would sign in more often.
3. **Finance Reports page (issue 1).** It is dead: no `/api/finance/reports` route exists (commented out in `server/src/routes/finance.ts`) and no role's navigation links to it. Its hook now makes no request. Decide whether to build it or delete the page.
4. **Telemetry (issue 12).** Refine telemetry is off (`disableTelemetry: true` in `client/src/App.tsx`).

## Finance reads: role by route (issue 5)

| Route (GET) | finance-manager | owner | admin | it-designer | project-manager | engineer | site-personnel | architect | hr | consultant |
|---|---|---|---|---|---|---|---|---|---|---|
| `/finance/budgets`, `/finance/budgets/:id` | all | all | all | all | own projects | 403 | 403 | 403 | 403 | 403 |
| `/finance/expenses` | all | all | all | all | own projects | 403 | 403 | 403 | 403 | 403 |
| `/finance/cash-flow` | yes | yes | yes | yes | 403 | 403 | 403 | 403 | 403 | 403 |
| `/finance/project-profitability` | yes | yes | yes | yes | 403 | 403 | 403 | 403 | 403 | 403 |
| `/finance/summary` | yes | yes | yes | yes | 403 | 403 | 403 | 403 | 403 | 403 |
| `/finance/approvals`, budget adjustments, approval steps (unchanged) | yes | 403 | yes | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `/finance/purchase-requests`, `/finance/procurement` (unchanged; delivery confirmation kept) | yes | 403 | yes | 403 | yes | yes | yes | 403 | 403 | 403 |
| `/finance/categories` (unchanged: a dropdown list, no amounts) | yes | n/a | yes | n/a | yes | yes | yes | yes | yes | n/a |

Files (`GET /api/uploads/file`): an expense receipt or a retired claim receipt opens for finance-manager, owner, admin, it-designer and the project's own project-manager; a delivery receipt also opens for engineer and site-personnel (they confirm deliveries). Files that belong to no finance record are not restricted by this rule.

## Per issue

| # | Commit | What changed | Proof |
|---|---|---|---|
| 1 | `fix(architect): send the login token...` | Architect Projects used raw `fetch()` with no token. Now `apiClient`, errors shown with Retry. Finance reports hook no longer calls a missing route. Only two raw `fetch("/api...")` calls existed. | `architect-projects.controller.test.ts` |
| 2 | `fix(security): remove public POST /api/notifications...` | Public POST removed (no client caller; server code creates notifications directly). Mark-read checks ownership (404 otherwise). | `notifications/ownership.test.ts`, `utils/params.test.ts` |
| 3 | `fix(security): server-side sign-out...` | `POST /api/auth/logout`, `users.tokens_valid_after` (migration 0032), password change and deactivation set it, `?token=` only on the notification stream. | `auth/session.test.ts`, `auth/routes.test.ts` |
| 4 | `fix(scope): limit designs, blueprints, proposals...` | Consultant and Project Manager scoped to their own projects (list and by-id). | `projects/scope.test.ts`, `proposals/files.test.ts` |
| 5 | `fix(security): restrict finance reads...` | See table. | `finance/access.test.ts`, `finance/read-access.test.ts` |
| 6 | `fix(errors): bad ids and empty bodies...` | 22P02 and 23502 to 400, 23503 to 409; `parseIdParam` on 104 id sites. | `middleware/pg-errors.test.ts`, `utils/params.test.ts` |
| 7 | `fix(attendance): a duplicate queued clock-in...` | Duplicate is 409 `ATTENDANCE_DUPLICATE`; the queue drops it, keeps other refusals as "needs attention" with Discard. | `sync-classify.test.ts` |
| 8 | `fix(requirements): PATCH and DELETE on a missing id...` | 404 instead of success; no other service had the pattern. | `utils/found.test.ts` |
| 9 | `fix(uploads): check file content...` | Magic-byte check on four upload paths. | `uploads/sniff.test.ts` |
| 10 | `fix(ui): toasts...` | Toasts for expense approve/reject, workflow decisions, refused milestone completion. | not unit-testable (UI) |
| 11 | `fix(forms): name the field in RFI errors...` | Field messages and "what is missing" hints. | `form-hints.test.ts`, `response-window.test.ts` |
| 12 | `chore(privacy): disable Refine telemetry` | `disableTelemetry: true`. | n/a |
| 13 | five `chore(tooling)` / `fix(migrations)` commits | 0006 idempotent (old hash registered), stale script removed, owner email env, demo:seed prerequisite, `ESTIMATIONPRO_BASE_URL`. | `db/migrations.test.ts` |

## Deploy notes

- Apply migration **0032** before deploying (every users query selects `tokens_valid_after`): `npm --prefix server run db:migrate`.
- The session check is cached for 15 s per server instance: a sign-out is immediate on the instance that handled it and within 15 s elsewhere.
- Contract changes: `POST /api/notifications` is gone; `?token=` works only on `/api/notifications/stream`; a duplicate clock-in is 409 (was 400); finance GETs return 403 for roles without a finance function; designs, blueprints, proposals and design reviews are scoped for Consultant and PM.

## Not verified

The throwaway Postgres, the API on port 8123, Vite and Playwright were not available, so none of `sweep.ts`, `files.ts`, `ui-check.mjs`, `action-check.mjs`, `mobile-layout-check.mjs`, `attendance-*.mjs`, `mail-check.mjs` or `lifecycle-walk.ts` (87 of 87) was run. Every fix is proven by unit tests and type-checks only. Run the scripts against the local throwaway stack before merging.
