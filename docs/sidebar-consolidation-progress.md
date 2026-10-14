# Sidebar consolidation — progress and decisions

Branch: `staging` only. Front-end, navigation only. No `server/` change, no guard change, no page merged or removed.

## What changed

| File | Change |
|---|---|
| `client/src/config/sidebar-nav.ts` | New. Per-role ordered entries (`item` / `group`) for `admin`, `it_designer`, `project_manager`, `architect`, and `buildSidebarNav()`. |
| `client/src/config/sidebar-nav.test.ts` | New. 69 tests (every role, real `resources` + `ROLE_RESOURCE_ACCESS`). |
| `client/src/components/refine-ui/layout/sidebar.tsx` | Renders `buildSidebarNav` for configured roles (collapsible group, icon-mode flyout); other roles use the unchanged flat rendering through the same `NavLeaf`. |

Not touched: `ROLE_CONFIGS[*].tabs` / `.sections` (header tabs and quick search), `ROLE_RESOURCE_ACCESS`, `resources.ts`, `App.tsx` guards, `client/vercel.json`, `.env`, anything in `server/`.

`buildSidebarNav` rules: access is re-filtered through `ROLE_RESOURCE_ACCESS`; a group with fewer than two visible children is flattened to plain items; any granted and registered resource missing from a role's config is appended as a plain item (so nothing can silently vanish); roles with no config stay flat and grouped by `meta.group` as before.

## Baseline (staging, before changes)

`git diff origin/prod origin/staging --stat -- client/src` printed nothing: `client/src` is identical on `prod` and `staging`.

| Command (in `client/`) | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no output |
| `npx vitest run` | 73 tests passing (the run that saw 142 also contained the 69 new tests) |
| `npx eslint src/components/refine-ui/layout src/config src/providers src/lib/nav-active.ts` | exit 0 |
| `npm run build` | exit 0 (`built in 1m 4s`; the usual >500 kB chunk warning) |

Pre-existing failures: none found.

## Combination decision matrix (tags A–N)

"Tag" = scope-tagged; "UX" = usability grouping, not from the scope.

| Tag | Role | Decision | Parent / children | Reasoning and permission notes | Source |
|---|---|---|---|---|---|
| A | Owner | KEEP SEPARATE (left flat) | Reports, Audit Trail, System Oversight stay top-level | Owner has 7 entries; a group adds a click without removing clutter. | scope |
| B | Owner | KEEP SEPARATE (left flat) | Portfolio, Proposals | Same. | scope |
| C | Admin | COMBINE | **Workflow Management**: Workflows, Workflow Configuration, Approval Hierarchy | Routes `/admin/workflows`, `/admin/workflow-configuration`, `/admin/approval-hierarchy`; each keeps its `RequireRole(admin, it_designer)`. | scope |
| D | Admin | COMBINE | **Security & Administration**: Activity Logs, Security, Roles & Permissions | `/admin/activity-logs`, `/admin/security`, `/admin/roles-permissions`. | scope |
| E | IT Designer | PARTIALLY COMBINE | **Operations Oversight**: Projects, Documents, Proposals. **Workflow Management** (shared with F). **Security & Audit**: Activity Logs, Security | "System Oversight and Audit Viewing" has no page (see F5). Project Operations and Proposal Monitoring are grouped as oversight; Workflow Oversight sits with Workflow Management. | scope |
| F | IT Designer | COMBINE | **Workflow Management**: Workflows, Workflow Configuration, Approval Hierarchy | Same `/admin/*` pages. Read-only for IT Designer in code (F7). | scope |
| G | IT Designer | COMBINE | **User & Access**: User Accounts, Roles & Permissions | `/it-designer/users`, `/it-designer/roles-permissions`. User Support is not in G and stays top-level. | scope |
| H | Project Manager | COMBINE | **Project Delivery**: Issues, Tasks, Reports | `/issues`, `/tasks`, `/reports`. Resources & Tools is not in H and stays top-level. | scope |
| I | Human Resources | KEEP SEPARATE (left flat) | Employees, Attendance | HR has 8 entries. | scope |
| J (tentative) | Human Resources | KEEP SEPARATE (left flat) | Workforce Reports, Reports | Reports is already one shared page (F6). | scope |
| K (tentative) | Finance Manager | KEEP SEPARATE (left flat) | Impact Review, Reports | Finance has 7 entries. | scope |
| L (tentative) | Architect | COMBINE | **Designs & Proposals**: Designs, Proposals. Approvals stays top-level (badge) | Project Monitoring, Revision, Document and Blueprint Management are not in L. | scope |
| M (tentative) | Engineer | KEEP SEPARATE (left flat) | Approvals, Progress, Requirements, Issues | 9 entries; Issues is already the shared `/issues` route (F6). | scope |
| N (tentative) | Site Personnel | KEEP SEPARATE (left flat) | Requirements, Tasks, Issues | 7 entries; same `/issues` route. | scope |
| — | Admin, PM, Architect | COMBINE | **Records** (Admin) / **Records & Requests** (PM, Architect): Requests, My claims (PM/Architect), Archive search, Legacy import | Not scope-tagged. | UX |
| — | Architect | COMBINE | **Design Files**: Blueprints, Revisions, Documentation | Not scope-tagged. | UX |

A, B, I, J, K, M and N were evaluated and left flat. Tags that should not be combined further: anything including Approvals (badge must stay visible), and Dashboard.

## Per-role sidebar, before and after

Counts exclude the flag-gated AI reference (`VITE_FEATURE_AI`). Add 1 to both sides where it is on. The brief's 14/13/14/13 "before" figures include it.

| Role | Before | After | Structure after |
|---|---|---|---|
| Admin | 13 | 7 | Dashboard · Projects · Documents · Workflow Management ▾(3) · Security & Administration ▾(3) · Records ▾(3) · User Support |
| IT Designer | 12 | 6 | Dashboard · User & Access ▾(2) · Operations Oversight ▾(3) · Workflow Management ▾(3) · Security & Audit ▾(2) · User Support |
| Project Manager | 13 | 8 | Dashboard · Projects · Workflows · Approvals(badge) · Documents · Project Delivery ▾(3) · Records & Requests ▾(4) · Resources |
| Architect | 12 | 6 | Dashboard · Projects · Designs & Proposals ▾(2) · Design Files ▾(3) · Approvals(badge) · Records & Requests ▾(4) |
| Owner | 7 | 7 | unchanged |
| Human Resources | 8 | 8 | unchanged |
| Finance Manager | 7 | 7 | unchanged |
| Engineer | 9 | 9 | unchanged |
| Site Personnel | 7 | 7 | unchanged |
| Consultant | 6 shown (7 granted) | 6 | unchanged; see Consultant gap below |

## Notes

**F5 — scope items with no page (no placeholders created).**
- System Oversight and Audit Viewing (IT Designer, E): not implemented as a page. Closest existing pages: `/it-designer/activity-logs` and `/it-designer/security`.
- Security Settings and System Activity Monitoring (inside G's Roles & Permissions text): no page of their own; `/it-designer/security` and `/it-designer/activity-logs` cover the monitoring side.
- Impact Awareness Viewing (Architect): not implemented.

**F7 — scope vs code conflict, left as is.** The scope says the IT Designer maintains workflow templates. In code `admin-workflow-configuration` is read-only for `it-designer`, and the server lets only `admin` create or delete templates.

## Report-only findings

### (a) Client routes with no `RequireRole` in `App.tsx`

These are reachable by URL by any signed-in user at the client level. The client guard is not the security boundary; the server decides. What I verified in the server:

| Client route(s) | Server rule found |
|---|---|
| `/issues` | `GET /api/issues` and `/:id`: `authenticate` only, no `requireRole`. POST: site-personnel, engineer. Status PATCH: project-manager, engineer. |
| `/reports` (engineering reports) | `GET /api/engineering-reports` and `/:id`: `authenticate` only. POST/DELETE: engineer, admin. PATCH: engineer, admin, project-manager. |
| `/tasks` | POST/PATCH: project-manager, engineer; status: site-personnel; DELETE: project-manager. GETs not role-gated. |
| `/projects`, `/projects/:projectId` | Writes: project-manager, admin. |
| `/designs*`, `/proposals`, `/architect/*`, `/blueprints` | Design writes: architect, admin; proposals: author architect/admin, review consultant/admin; blueprint decide: consultant, PM, admin. Reads not role-gated. |
| `/requirements` | Writes engineer/admin (+ site-personnel, PM on some). |
| `/documents`, `/attendance`, `/dashboard` | Dispatch by role in `DocumentsRouter` / `AttendanceRouter` / `DashboardRouter`; attendance and documents have per-route `requireRole` on the server. |
| `/workflows`, `/approvals`, `/requests`, `/transmittals`, `/progress`, `/resources`, `/archive`, `/legacy-import`, `/blueprint-reviews`, `/advisory-docs`, `/ai-validation-reference`, `/design-system` | **Not individually traced.** Needs a follow-up read before anyone claims they are safe. |

Where the client is weaker than the server: that is the general pattern. Read endpoints for the pages above are authenticated but not role-gated, so the client route and server GET both let any signed-in role in; only project scoping (see c) narrows the rows. `/ai-validation-reference` is in every role's sidebar access list, while `server/src/ai-validation/routes.ts` has an `admin`-only router; I did not confirm whether the reference page calls that API, so check it.

### (b) Consultant `consultant-design-reviews`

Granted in `role-resources.ts`, routed at `/consultant/design-reviews` (guarded for `consultant`), but absent from `providers/resources.ts`, so it never appears in the Consultant sidebar. Not fixed.

### (c) Data scoping on `GET /api/issues` and `GET /api/engineering-reports`

Both are limited by role in the controller, not the route:
- Project Manager: only projects assigned to them (`own-projects`).
- Engineer, Architect, Site Personnel, Consultant: only projects they are staffed on (`MEMBERSHIP_SCOPED_ROLES`).
- Admin, IT Designer, Owner, HR, Finance: all rows.
- Issues, additionally: site-personnel see only issues they reported (`reportedByUserId`); by-id reads check project visibility except for site-personnel (who are filtered on the list but not checked on `GET /:id`; worth a follow-up).
- Engineering reports: by-id read calls `assertProjectVisible`.

## Verification (Phase 4)

Run in `client/` after Phase 2 (real results):

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` on `sidebar-nav.ts`, `sidebar-nav.test.ts`, `sidebar.tsx` | exit 0 |
| `npx vitest run` | 5 files, 142 tests passed |
| `npm run build` | exit 0 (`built in 53.79s`) |

**Not done: browser verification for the ten roles.** Rendering was not exercised in a browser. Signing in needs real staging credentials, which I may not enter, and forging a local session was refused. Still to check by hand: the expected sidebar per role, expand/collapse, parent/child active highlight, deep link / refresh / back-forward, icon-collapsed flyout, mobile width, keyboard use, light and dark themes, the Approvals badge, and one action on a regrouped page.

## Checklist

- [x] Branch confirmed `staging`, baseline recorded
- [x] Phase 1 — config, `buildSidebarNav`, tests (commit `e6348a3`)
- [x] Phase 2 — sidebar rendering (commit `67e78ad`)
- [x] Phase 3 — this document
- [ ] Phase 4 — browser checks for all ten roles (needs a signed-in session)
- [ ] Owner: fast-forward `dev` from `staging`
