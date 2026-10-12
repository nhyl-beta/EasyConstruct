# Objectives 1, 2, 3 fixes — progress

Branch: `staging`. Baseline commit `3a34bc3` (Oct 12 2026).
Scope: 20 fixes for Objectives 1, 2 and 3. Rule-based decision support only; it never blocks, approves, rejects or applies anything.

## Phase 0 baseline (before any change)

| Check | Result |
|---|---|
| Branch / commit | `staging` @ `3a34bc3`, clean tree |
| `tsc --noEmit` server | clean |
| `tsc --noEmit` client | clean |
| `npm --prefix server test` | 496 of 497 pass. The one failure is `proposals/validate.test.ts` "flag off", because the local `server/.env` sets `FEATURE_AI=true` while the test assumes it is unset. Environment-specific, not a code defect. |
| `npm --prefix client test` (vitest) | 259 of 259 pass |

### Deployment model (rule 7)
- `server/index.ts` exports the Express app for Vercel and only calls `listen` when `process.env.VERCEL` is unset. There is no `server/vercel.json`; only `client/vercel.json` (SPA rewrite). The server is therefore treated as **serverless**: in-process timers do not reliably tick.
- `design-requests/scheduler.ts` (`startOverdueSweeper`) uses `setInterval`. It is started from `server/src/index.ts` (the local entry), never from `server/index.ts`, and it also refuses to start when `VERCEL` is set. **On Vercel the RFI/RFA overdue job therefore never runs by itself.** Its sweep is only reachable as `POST /api/design-requests/sweep` and needs an external cron. This was reported, not fixed (per rule 7).
- Consequence for fixes 2.3 and 3.5: each scheduled job is built as an authenticated cron endpoint (`CRON_SECRET` header) plus a Vercel cron entry, with a local interval only for development.

### Findings per fix (what existed before)
Filled in as each fix is reached. See the table below.

## Fix status

| Fix | Priority | Status | Found | Changed | Tests | Left |
|---|---|---|---|---|---|---|
| 2.1 Rule-based task allocation | P1 | done | Missing. Task creation lives in `NewTaskCard` inside `pages/roles/site-personnel/sp-tasks.tsx` (route `/tasks`, used by PM and Engineer). `employees.role` is the position field; `employees.userId` links a login to an employee. | `tasks/suggest.ts` (pure), loader in `tasks/repository.ts`, service, controller, routes (`GET /tasks/suggest-assignees`, `POST /tasks/suggest-allocation`), client panel + review card | `tasks/suggest.test.ts` (11) | decision-support events (3.7) |
| 2.2 Workload and overlap warning | P2 | done | Missing | `assessAssignment` in `tasks/suggest.ts`; `GET /tasks/assignment-warnings`; create/update responses carry `warnings`; shown before and after save | in `suggest.test.ts` | — |

## Decisions made without the owner (state of the product call)
- Candidates for allocation are Site Personnel staffed on the project (`project_members.role = 'site-personnel'`) with a linked employee record, because only site personnel can advance a task's status (`tasks/service.ts updateStatus`). Staffed users with no employee record are listed as "left out", not guessed at.
- Task create and update now call `assertProjectVisible` in the controller (previously the project-scoping rule was not applied there).

## Not built on purpose
- **1.1 ORRA branding** — removed by the owner.
- **1.6 Email copies of notifications** — removed by the owner. Notifications stay in-app only.
- **Objective 4** (reports hub, export, one-page report, charts, snapshots, owner/IT/architect impact cards) — deferred.

## Manual steps for the owner
(Collected as fixes land.)
