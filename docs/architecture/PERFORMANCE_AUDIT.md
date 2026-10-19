# EasyConstruct — Performance audit (phase 1, read-only)

Branch: `staging`. Everything below is read from the code at the start of this task; counts are **static counts** (no remote environment was called, no database was reachable — there is no `server/.env` in the working copy). Every claim names the file it comes from.

Baseline before any change: server `tsc --noEmit` clean, 312 server tests pass (`npm test`), client `tsc` clean, client `vitest` 66 pass, client `vite build` OK (single 2.4 MB JS chunk), client `eslint` already fails with 17 errors in 12 files (unused vars etc.), so "lint passes" means "no new errors".

## 0. Findings that shape the plan

1. **The client does not use TanStack Query, and Refine's data hooks are not used by any page.** There is no `QueryClient`, `useQuery`, `staleTime` or `placeholderData` anywhere in `client/src`. Every screen fetches with hand-written `useState` + `useEffect` hooks that call `apiClient` through a `repository` (for example `features/projects/controllers/project.controller.ts`, `features/hr/hooks/use-hr.ts`, `features/workflows/hooks/useWorkflows.ts`). Refine only supplies routing, the resource list and access control; the Refine `data-table` component is "fully built but not wired into any page" (`hooks/use-pagination.ts`, header comment). The custom `dataProvider` (`providers/data.ts`) is therefore not on the hot path of any list screen. Consequence for phase 5: there is no TanStack default to tune; the equivalent has to be added at the repository/hook layer (see "Open decision" in the final report).
2. **Pagination already exists in four places with a different vocabulary from the task**: `GET /projects`, `GET /attendance`, `GET /revisions` and `GET /audit-logs` accept an opt-in `page` + `pageSize` (audit logs: `page` + `perPage`) and return `meta: { total, page, pageSize, pages }` (`projects/controller.ts`, `attendance/controller.ts`, `utils/paging.ts`, `audit-logs/service.ts`). The shared helper `utils/paging.ts` already clamps (`DEFAULT_PAGE_SIZE = 10`, `MAX_PAGE_SIZE = 100`). The task's `limit` + `meta.limit` will be added as an additive alias, not a rename. The Refine `dataProvider` sends `current` + `limit` (`providers/data.ts` `buildQuery`), which no server route reads.
3. **`projects` "page" is sliced in JavaScript.** `projects/service.ts` `getPage` loads the whole scoped list via `visibleProjects` and slices (`all.slice`), so the paged table still reads every project row.
4. **Project scoping loads every project on every scoped request.** `projects/service.ts` `projectCodesForPm` does `repo.findAll({})` then filters in JS; `visibleProjectCodes` (used by tasks, issues, requirements, reports, milestones, workflows, documents…) calls it for every project manager request. `projects/scope.ts` `scopeRowsByDesign` loads **all designs** per call.
5. **No secondary index exists in the schema.** `grep` over `db/schema/*.ts` finds only primary keys, `unique()` constraints, `revisions_*` indexes (revisions.ts) and two unique indexes (`project_deliverables_project_discipline_uq`, `design_requests_project_kind_disc_seq_uq`). No foreign-key column, no status column and no date column used in filters is indexed.
6. **Documents are already metadata-only in responses** (see §7).
7. **`pg_trgm`**: no migration, SQL or code in the repo enables it (`grep pg_trgm` finds nothing). Trigram indexes are therefore an owner decision, not part of the SQL file.
8. **The docs folder is git-ignored** (`.gitignore` line `docs/`), but five files under `docs/` are tracked. New docs are added with `git add -f`.

## 1. Requests per screen (on load)

### 1.1 Layout, present on every authenticated page
| Call | Source | Notes |
| --- | --- | --- |
| `GET /notifications` (+ `GET /notifications/stream` SSE) | `components/notifications/notification-bell.tsx` → `features/notifications/hooks/useNotifications.ts` | full list, unbounded. **Out of scope to change** (notifications stay live). |
| `GET /workflows/approvals/stats` | `components/refine-ui/layout/header.tsx:43` `useApprovalsPendingCount` | |
| `GET /workflows/approvals/stats` (again) | `components/refine-ui/layout/sidebar.tsx:72` same hook | **duplicate of the header call** |

Layout baseline: **3 requests + 1 SSE stream** on every page. Every dashboard additionally mounts `CalendarWidget` (`pages/dashboard/index.tsx`) → `GET /calendar/events` (1).

### 1.2 Role dashboards (page-specific requests, excluding the 3 layout requests)
"Full" = unpaginated list fetched only to count/sort in the browser.

| Dashboard | Requests | Detail (source) | Full-list fetches |
| --- | --- | --- | --- |
| Owner (`features/dashboard/controllers/owner-dashboard.controller.ts`) | 9 | `/projects`, `/workflows`, `/workflows/approvals?scope=pending`, `/workflows/approvals/stats`, `/audit-logs`, `/proposals`, `/payroll/owner-summary`, `ImpactAwarenessCard` `/lifecycle/impact`, calendar | 5 (projects, workflows, approvals, audit-logs, proposals) |
| Admin (`admin-dashboard.controller.ts`, `admin-dashboard.tsx`) | 13 | `/projects`, `/workflows`, approvals + stats, `/notifications` (**second copy and a second SSE stream**, `useNotifications` inside the controller), `/audit-logs`, `/proposals`, `AttentionCard` `/design-requests/attention`, `WaitingOnYouCard` `/lifecycle/my-actions`, `WorkforceSnapshotCard` `/employees` + `/attendance`, `RefreshReferencesCard` `/ai-validation/references-status`, calendar | 8 |
| Project Manager (`pm-dashboard.controller.ts`, `AwaitingApprovalCard`, `PmPortfolioCharts`) | 6 | `/projects`, approvals + stats, `/tasks` (`useProjectTaskProgress`), `/lifecycle/my-actions`, calendar | 3 |
| Human Resources (`hr-dashboard.tsx`) | 6 | `useWorkforceSnapshot` → `/employees` + `/attendance`; `useWorkforceReport` → `useEmployees` `/employees` + `useAttendance` `/attendance`; `/lifecycle/my-actions`; calendar | 4 — **the same two lists fetched twice** |
| Finance (`features/finance/hooks/use-finance-dashboard.ts`) | 8 | `/finance/budgets`, `/finance/expenses`, `/finance/cash-flow`, `/finance/project-profitability`, `/finance/summary`, `/finance/approvals?limit=20`, `/lifecycle/my-actions`, calendar | 2 (budgets, expenses; expenses is capped at 20 server-side, `finance/expenses/repository.ts`) |
| Architect (`architect-dashboard.controller.ts`) | 7 | `/designs`, `/proposals`, `/revisions/summary`, `/design-reviews`, `/lifecycle/my-actions`, `/lifecycle/impact`, calendar | 3 |
| Engineer (`engineer-dashboard.controller.ts`) | 7 | `/projects`, `/engineering-reports`, `/requirements`, `/issues`, `/project-members?userId=`, `/lifecycle/my-actions`, calendar | 4 |
| Consultant (`consultant-dashboard.controller.ts`) | 5 | `/proposals`, `/projects`, `/documents`, `/lifecycle/my-actions`, calendar | 3 |
| IT Designer (`it-designer-dashboard.controller.ts`) | 6 | `/users`, `/roles`, `/audit-logs`, `/lifecycle/my-actions`, `/lifecycle/impact`, calendar | 3 (users, roles, audit-logs) |
| Site Personnel (`sp-dashboard.tsx`) | 7 | `/employees/me`, `/attendance?employeeId=`, `/tasks` (mine), `/issues` (mine), `/documents`, `/lifecycle/my-actions`, calendar | 2 (documents, attendance by employee) |

Everything those dashboards show is a handful of numbers plus top-5 lists, derived in the browser from the full lists (`useMemo(... .filter(...).length)` in each controller).

### 1.3 List pages
Pagination mode today: **S** = server (`page`/`pageSize`), **C** = browser slice via `usePagination`, **N** = whole list rendered, no paging. Search: **D** = debounced 300 ms, **K** = request per keystroke or filter in browser.

| Page | Calls on load | Paging | Notes |
| --- | --- | --- | --- |
| admin-projects (`useProjectsPaged`) | `/projects?page&pageSize` + `/projects` (full, for the KPI strip) | S + full list | search D (300 ms); KPI strip downloads every project (`hooks/useProjectsPaged.ts`) |
| pm-projects, consultant-projects, owner-portfolio, architect-revisions, finance-budget (`useProjects`) | `/projects` full | N | filter/search in browser (`ProjectService.queryProjects` slices in JS) |
| architect-projects | `/projects` + `/designs` (`designs/controllers/architect-projects.controller.ts`) | N | |
| admin-workflows, pm-workflows | `/workflows` + `/workflows/templates` | N | |
| admin-activity-logs | `/audit-logs?page&perPage` + `/audit-logs/facets` | S | search D |
| admin-security | `/audit-logs` (full) + `/audit-logs/security-overview` | C | |
| admin-roles-permissions / it-designer-users | `/roles` / `/users` + `/roles` | C | |
| hr-employees | `/employees` via `hr-api` (`pages/roles/human-resources/hr-employees.tsx`) | C | filter in browser |
| hr-attendance | `/attendance?page&pageSize` | S | |
| hr-payroll | `/payroll` and `/payroll/batches/all` via `hr/payroll-api.ts` | C | |
| hr-workforce | `/employees` + `/attendance` full | N | |
| finance-expenses | `/finance/expenses` (server default 20, no total) | C over ≤20 | |
| finance-payroll-review | `/finance/payroll-review` | C | |
| finance-budget | budgets, adjustments, approval steps, projects | N | |
| pm-documents, consultant-advisory-docs, architect-documentation, sp-documents | `/documents` (+ `/proposals`, `/designs?projectCode` for related candidates) | C / N | |
| architect-designs, consultant-designs | `/designs` + `/revisions` current | N | search by keystroke (`useDesignsController` re-fetches on every `query` change) |
| architect-proposals, consultant-proposals | `/proposals` | N | `useProposals` re-fetches on every `query` change |
| engineer-issues, sp-issues | `/issues` | N | |
| engineer-requirements | `/requirements` | N | |
| engineer-progress, shared-reports | `/engineering-reports` + `/tasks` | N | |
| shared-requests, shared-transmittals | `/design-requests`, `/transmittals` | N | |
| sp-tasks | `/tasks`, `/milestones`, `/project-members?projectCode=` (hooks used: `useMyTasks`, `useMilestones`, `useProjectMembers`) | N | `/tasks` is the same endpoint for "mine" and "all" (`tasks/repositories/task.repository.ts`) |
| sp-attendance | `/attendance?employeeId=`, `/employees/me`, `/projects`, staffed project codes, upload (hooks listed in `sp-attendance.tsx`; exact calls not traced one by one) | N | |

## 2. Server hot spots by module

(repository = `server/src/<module>/repository.ts` unless noted)

**Unpaginated list endpoints (return every row):** projects (when `page` absent) · employees (`employees/repository.ts findAll`) · attendance (when `page` absent) · HR `/hr/employees`, `/hr/attendance`, `/hr/payroll*` (`hr/repository.ts`) · payroll `/payroll`, `/payroll/batches/all` (`payroll/service.ts getAll`, `listBatches`) · documents (`documents/repository.ts findAll`) · proposals (`proposals/repository.ts findAll`) · workflows (`workflows/repository.ts findWorkflows`) · tasks · issues · requirements · engineering-reports · designs · design-reviews · design-revisions · blueprints · architect-documents · milestones · users · roles · project-members · transmittals · design-requests · notifications (`notifications/repository.ts findForRecipient`, **left as is**) · audit-logs (when `page` absent) · finance budgets / adjustments / approval-steps / cash-flow / approvals / payroll-review.

**Whole-row (`SELECT *`) returns where screens show few columns:** every `db.select().from(x)` list above. Heaviest are `proposals` (`content`, `aiValidation` text), `workflows` (`content` text), `engineering_reports` (7 text columns), `requirements` (`attachments` jsonb), `designs` (`fileUrls` jsonb), `audit_logs` (`summary` text), `tasks`/`issues` (descriptions). The dashboards read counts and a few titles only.

**N+1 and per-row query patterns (query inside a loop):**
| # | Where | Pattern |
| --- | --- | --- |
| N1 | `payroll/service.ts` `employeesFor` (line ~162) | one `findByEmployeeId` per distinct payroll line employee — runs on every batch validation |
| N2 | `payroll/service.ts` `getAttendanceReadiness` (line ~270) | one `findByEmployeeId` per employee in the period |
| N3 | `payroll/service.ts` `generate` (line ~314) | one `findByEmployeeId` per entry, then one insert per line inside the transaction |
| N4 | `payroll/service.ts` contributions report (line ~649) | `repo.findByBatch(b.id)` per approved batch |
| N5 | `hr/service.ts` payroll attendance rows (line ~515) | `Promise.all(employeeIds.map(findEmployeeByEmployeeId))` |
| N6 | `lifecycle/my-actions.ts getMyActions` | `repo.loadSnapshot(project.code)` per active project; each snapshot is ~17 queries (`lifecycle/repository.ts loadSnapshot`) → ~17 × projects queries per call, and it is on every dashboard |
| N7 | `lifecycle/my-actions.ts getImpactAwareness` | same `loadSnapshot` per project |
| N8 | `calendar/service.ts` (lines ~59, ~94) | `milestonesRepo.findAll(code)` and `lifecycleRepo.findPhaseHistory(code)` per project (2 × projects queries) plus all workflows |
| N9 | `milestones/service.ts syncLinkedTaskDueDates` (line ~143) and `tasks/service.ts` (line ~136) | `tasksRepo.findById` / `findLinks` per linked task/milestone (write paths) |
| N10 | `transmittals/service.ts` (line ~29) | `repo.findById` per transmittal item |
| N11 | `notifications/service.ts notifyProject` (line ~64) | project lookup inside a loop over roles (write path) |

**Joins done in JavaScript:** `projects/scope.ts scopeRowsByDesign` (designs fetched, joined by id in a `Map`); `lifecycle/my-actions.ts` and `calendar/service.ts` (all projects fetched, filtered by membership/PM in JS); `projects/service.ts visibleProjects` (membership scope applied after loading all projects).

**Aggregates computed in JavaScript after fetching rows:**
| # | Where | What |
| --- | --- | --- |
| A1 | `hr/service.ts attendanceSummary` | loads all active employees and all logs of a day to count verified/pending/flagged/late/absent |
| A2 | `hr/service.ts workforceReport` and `payrollRowsForPeriod` | whole tables, grouped in JS |
| A3 | `workforce-reports/service.ts getSummary` | all employees, all attendance in range, all payroll lines; counts/sums in JS |
| A4 | `attendance/repository.ts findSince` (heatmap) | all attendance rows since a date, bucketed in `attendance/heatmap.ts` |
| A5 | `finance/summary/repository.ts` | already SQL `sum`/`count` for budgets and pending payroll (good); profitability averages in JS over a grouped query (small) |
| A6 | `payroll/owner-summary.repository.ts` | already a grouped SQL query per batch (good), trend in `owner-summary.service.ts` |
| A7 | client-side: every `*-dashboard.controller.ts` (counts over full lists) | moved to the server in phase 3 |

**Unbounded `search`:** `ilike '%…%'` on `projects.name/code/pm`, `employees.name/employee_id/role`, `attendance.employee_id/site` (+ a name sub-select), `audit_logs.actor/action/entity_type/summary`, `expenses.vendor/id` — none can use a b-tree index, and the lists they search are not bounded unless the caller sends `page`.

**Other:** `finance/expenses/repository.ts findAllForAnomaly` selects every expense on each create/approve (write path). `ai-validation/cache.ts getReferenceItems` reads the whole `reference_snapshots` table on each validation.

## 3. Missing indexes (candidates)
Only primary keys, uniques and the `revisions_*` indexes exist today. Candidates by query:

| Table.column | Query it serves (file) |
| --- | --- |
| `attendance(log_date)`, `(employee_id, log_date)`, `(project_code, log_date)` | date range + sort, per employee, per project (`attendance/repository.ts buildConditions`, `findPage`, `findSince`, `findVerified`; `hr/repository.ts findAttendance`) |
| `attendance(status)` | summary `count(*) filter` (verification) |
| `payroll(batch_id)` | `findByBatch`, `owner-summary.repository.ts` group by |
| `payroll(period)` | `payroll/repository.ts findAll` filter |
| `payroll_batches(status)`, `(project_code)` | finance approvals, payroll review list, owner summary |
| `projects(status)`, `(pm_user_id)`, `(pm)` | list filters and PM scope (`projects/repository.ts findAll`) |
| `project_members(user_id)`, `(project_code)` | membership scope (`project-members/repository.ts`) |
| `workflows(project_code)`, `(status)`, `(created_at)` | `workflows/repository.ts findWorkflows`, lifecycle snapshot |
| `workflow_stages(workflow_id, sequence)`, `(status)` | `findStagesForWorkflows`, approvals queue |
| `proposals(project_code)`, `(status)`, `(workflow_id)` | lists, lifecycle snapshot, `findByWorkflowId` |
| `documents(project)`, `(type)` | `documents/repository.ts findAll` |
| `designs(project_code)`; `design_reviews(design_id)`; `design_revisions(design_id)`; `blueprints(project_code)`, `(design_id)`; `architect_documents(design_id)` | scope joins and lifecycle snapshot |
| `tasks(project_code)`, `(assigned_to_user_id)`; `issues(project_code)`, `(status)`, `(reported_by_user_id)`; `requirements(project, status)`; `engineering_reports(project)`; `milestones(project_code)`; `milestone_links(milestone_id)` | lists and lifecycle snapshot (`lifecycle/repository.ts loadSnapshot`) |
| `notifications(recipient_user_id, created_at)`, `(role)` | `findForRecipient` — **index only; query unchanged** |
| `audit_logs(created_at)`, `(entity_type, action)`, `(actor)` | ordered list, `findRecentSessions`, `findFailedLogins` |
| `expenses(status)`, `(submitted_at)`; `budgets(project)`, `(status)`; `cash_flow` | finance approvals, list order, rollups |
| `design_requests(project_code)`, `(status)`, `(assigned_to_user_id)`; `transmittals(project_code)` | request lists, attention |
| `employees(status)`, `(department)`, `(user_id)` | filters and `findByUserId` |
| `users(role)` | `users/repository.ts` role filter |
| Trigram (GIN) on `projects.name`, `employees.name`, etc. | `ilike '%x%'` search — **needs `pg_trgm`, not enabled anywhere in the repo: owner decision** |

## 4. Database connection
- Driver: `pg` `Pool` through `drizzle-orm/node-postgres` (`server/src/db/connection.ts`); `@neondatabase/serverless` is a dependency but unused by the connection module.
- `db` is already a **module-level singleton** (`const pool = new Pool({ connectionString })`), but with **no pool options**: default `max = 10`, no idle timeout, no connection timeout. On Vercel each warm function instance keeps up to 10 TCP connections to Neon; with several concurrent instances this multiplies and a burst of 13+ parallel requests per dashboard load uses the pool fully. Cold start pays one TLS handshake per new connection.
- `drizzle.config.ts` is used only by migration scripts.
- Entry: `server/index.ts` exports the Express app for Vercel and listens only when `process.env.VERCEL` is unset. No `vercel.json` in `server/` (only `client/vercel.json` with the SPA rewrite), so the function region is whatever the Vercel project is set to — **owner check**.
- `package.json` scripts: `db:migrate`, `db:reset`, `db:seed` exist but none runs on `build` (`tsc --noCheck`) or `start` (`node dist/index.js`); nothing auto-runs migrations. Vercel project settings could not be inspected from here.
- `middleware/auth.ts` keeps a 15 s per-process in-memory cache of `password_changed_at` (not a shared cache; it stays as is — authentication is explicitly not to be cached in Redis).

## 5. Client behavior
- No TanStack Query: every hook is `useState/useEffect` with a manual `load()`; there is **no shared cache and no request de-duplication**. Navigating between pages refetches everything; going back refetches again. Effective `staleTime` is 0 and every mount refetches. (Refetch-on-focus does not occur because there is no query layer.)
- Same resource fetched by several components on one screen: `/workflows/approvals/stats` ×2 (header + sidebar) on every page; `/employees` + `/attendance` ×2 on the HR dashboard; admin dashboard opens a second `/notifications` fetch and a second SSE stream; `/projects` is fetched by the page and again by the quick-search source only after the palette opens (lazy, fine).
- Filtering/paginating full lists in the browser: `ProjectService.queryProjects` (fetches all, filters in JS), `usePagination` on hr-employees, hr-payroll, finance-payroll-review, finance-expenses, pm-documents, it-designer-users, admin-security, approval-queue-panel; all dashboard counts.
- Search per keystroke: `useDesignsController` and `useProposalsController` re-fetch on every character (`query` is in their effect deps, no debounce); admin-activity-logs, approval-queue-panel and `useProjectsPaged` are debounced (300 ms).
- Polling: none found (`setInterval` is used only for the session heartbeat in `auth/session.ts`). SSE for notifications (`useNotificationStream.ts`).
- Mutations: each hook calls its own `load()` after a write (for example `useEmployees.create/update` → `load()`); no global invalidation. This is already narrow, but it refetches the whole list instead of the changed row/page.
- Client bundle: one JS chunk of 2.4 MB (666 KB gzip); not in the scope of this task, noted for the owner.

## 6. Slow or external work in a request
- `ai-validation/cache.ts getReferenceItems` → `refreshOnce` → `reference-client.ts` calls `https://estimationpro.ai/api/v1` **sequentially per trade, 5 s timeout each**, when the snapshot cache is empty or older than `REFERENCE_CACHE_TTL_MS`. It is reached from proposal create/submit/validate (`proposals/service.ts` → `proposals/validation.ts`), so a user can wait on it. Candidate for phase 6.
- `POST /api/ai-validation/refresh-references` (`ai-validation/routes.ts`) does the same loop on demand (admin only).
- Payroll generation: `payroll/service.ts generate` issues one lookup and one insert per employee inside a transaction (N3); a 500-worker batch is ~1000 round trips.
- Attendance sheet import (`attendance/import.ts`, ExcelJS) parses the workbook inside the request.
- `lifecycle/my-actions.ts` and `calendar/service.ts` do N+1 on every dashboard load (N6–N8) — fixable by queries, not by background work.
- No report/PDF/Excel generation beyond the attendance template and import was found; reports are JSON computed on read.

## 7. Documents
- `documents` table (`db/schema/documents.ts`) holds metadata only: `document_id`, `title`, `project`, `type`, `version`, `size`, `uploaded_by`, `file_url` (varchar 500), `stage`, `related_*`, timestamps. `GET /api/documents` returns those columns (`documents/repository.ts findAll`); no file bytes.
- Upload: files arrive as a base64 data URL in the JSON body (`uploads/service.ts decodeDataUrl`, 8 MB cap) or multipart (`documents/upload.ts`), are stored in Vercel Blob / disk and only the URL is saved. Download goes through `GET /api/uploads/file?url=…` (streamed, authenticated).
- Related columns that can hold URLs only: `attendance.photo_url`, `designs.file_urls` (jsonb `{name,url}`), `requirements.attachments` (jsonb), `expenses.receipt_url` (text). A data-URL stored in a text/jsonb column cannot be ruled out without querying production data; the writers (`uploads/service.ts`) store blob/disk URLs. **Not verifiable without database access — owner may run** `select count(*) from expenses where receipt_url like 'data:%'` (read-only).
- Conclusion: confirmed by code that list responses carry metadata and URLs only.

## 8. Summary of the plan this audit supports
Phase 2: pool options + the N1–N11 and A1–A4 fixes + list shapes + `server/sql/performance-indexes.sql`. Phase 3: one paging helper (alias `limit`, additive `meta.limit`), bounded lists, `GET /api/dashboard/summary`, timing middleware. Phase 4: cache-aside with version stamps. Phase 5: see "Open decision" in the final report (no TanStack Query exists). Phase 6: only the reference-price refresh qualifies.

## 9. Corrections found while implementing phase 2
- Some secondary indexes do exist, created by migrations / `scripts/ensure-demo-schema.ts` rather than the Drizzle schema: `milestones_project_code_idx`, `milestone_links_milestone_idx`, `project_phase_history_project_code_idx`, `workflow_attachments_workflow_idx`, `workflow_line_items_workflow_idx`, `design_requests_project_idx`, `design_requests_assignee_idx`, `revisions_project_idx`, and unique indexes on `transmittals (project_code, sequence)`, `design_revisions`, `project_deliverables`. `server/sql/performance-indexes.sql` does not repeat them. Section 0 item 5 should read "almost no secondary index".
- A4 (attendance heatmap `findSince`): the query is already bounded to a 14-day window and selects five columns (`attendance/repository.ts`), so it was left as is; the `log_date` index covers it.
- The previous `projects` pool already was a module-level singleton (section 4); phase 2 only adds the pool limits.
- List-shape pruning: the list rows are also the detail rows in the UI (for example `ProposalsRegister.tsx` and `consultant-proposals.tsx` read `content` and `aiValidation` from the list item; `workflows/service.ts attachStages` deliberately returns attachments and line items with every workflow). Dropping those columns from list responses would change what the screens show, so phase 2 did not prune columns; the bounded page size (phase 3) and the dashboard summary endpoint (phase 3/5) are what remove the volume.
- Intentionally left as per-row work: `design-requests/service.ts sweepOverdue` (the scheduled overdue sweeper claims each request with an atomic UPDATE so concurrent sweeps cannot double-notify; it is not a user request).

## 10. Corrections and results after phase 5
- HR dashboard (section 1.2): `useWorkforceSnapshot` and `useWorkforceReport` both read `/employees` and `/attendance`, so it was 4 data requests on load (6 including `/lifecycle/my-actions` and the calendar), not 2. After phase 5 both hooks read `/api/dashboard/workforce` and the report is one aggregate call; `apiClient.get` also dedupes identical in-flight GETs, so a repeated read by two components is one request.
- Role dashboards now read one `GET /api/dashboard/summary` (plus `/lifecycle/my-actions` and calendar, now cached) instead of 3–8 full-list fetches each; owner/admin/PM/architect/engineer/consultant/IT designer/site personnel controllers are in `client/src/features/dashboard/hooks/useDashboardSummary.ts`.
- List pages now paged on the server: projects (PM, owner portfolio, consultant), workflows, HR employees, workforce board, HR payroll, finance expenses, IT designer users, PM documents (folder cards from `meta.typeCounts`, `?counts=1`), audit logs (already paged). Search inputs on proposals, designs, budgets, budget adjustments, architect documents, blueprints and engineering reports are debounced (300 ms) instead of querying on every keystroke. Also server-paged: proposals (register, consultant review queue via `?queue=consultant`, architect list via `excludeStatus=Archived`; KPI cards from `meta.statusCounts`, `?counts=1`), designs (KPI cards from `meta.statusCounts` over the same filters), and the approvals queue (search, type, requester and date filters on the server; filter choices in `meta.types` / `meta.requesters`). The dashboard approvals card asks for 5 rows and the quick-search sources for 100. Also server-paged in the third pass: issues (`meta.statusCounts` / `meta.severityCounts` for the cards), requirements (`meta.statusCounts`), engineering reports (type scope and status groups as comma lists, `meta.typeStatusCounts`), and finance payroll review (`?period=`, `meta.periods`). The engineer's "project task progress" card now reads `GET /api/tasks/progress` (one GROUP BY, checked equal to the old client rollup) instead of downloading every task.

Intentionally not changed:
- Finance budget: the register, allocation charts, approval pipeline and CSV export all work on the whole set of budgets (bounded by project x category x fiscal year), so the fetch stays; the register table now shows a page at a time (client-side).
- `useMyTasks` (a site-personnel user's own tasks) and the per-project requirement/task lists are bounded by user or project, so they were left as they are.
- Paging is still opt-in on the server for every endpoint (no endpoint is set to enforce a limit), because unbounded callers remain, for example the lookup lists. Server endpoints for these accept `page`/`limit` already where phase 3 added them (opt-in, default 20, max 100).
