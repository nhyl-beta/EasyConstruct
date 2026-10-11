# Breadcrumb consistency — audit, decisions and progress

Branch: `staging` only. Front-end, presentation only. The sidebar consolidation (`docs/sidebar-consolidation-progress.md`) had already landed and is untouched.

## Baseline (staging, before any code change)

| Command (in `client/`) | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 5 files, 142 tests passed |
| `npx eslint src/components/refine-ui src/config src/pages/roles/shared` | exit 1: **2 pre-existing errors** (`'TABS' is assigned a value but only used as a type` in `shared-blueprint-reviews.tsx:22`, `'DECISION_TABS'` in `shared-reports.tsx:29`) and 5 fast-refresh warnings. Not touched by this task. |
| `npm run build` | exit 0 (`built in 1m 15s`) |

## How this audit was made — read this first

The brief asks for "what the breadcrumb shows today (read from the running app)". **That was not possible**: signing in to the app needs a real staging login, and the local server is wired to the remote Neon database (login writes audit rows), which the brief forbids touching. So the "today" column below is **derived, not observed**:

- *Breadcrumb today* = what Refine's own `matchResourceFromRoute` returns for the route against the real `providers/resources.ts` patterns (run in Node, not guessed). It reproduces F4 exactly: `/`, `/projects/new`, `/projects/:projectId`, `/employees/new`, `/employees/:id/edit`, `/blueprint-reviews`, `/transmittals`, `/consultant/design-reviews` and `/design-system` match no resource.
- *Header today* = a transitive import scan of each routed page (follows imports up to 4 levels) for `<PageHeader`, `<h1`, `<h2`. This is better than the F6 scan but still static. Rows marked with a header problem still need confirming by rendering.

## Route table

`Roles` is from `ROLE_RESOURCE_ACCESS` (resource-matched routes) or the route's own `RequireRole` (others). `[x]` = nothing to do or done.

| Route | Page component | Roles | Header today | Breadcrumb today | Target trail | Fix | Done |
|---|---|---|---|---|---|---|---|
| `/login` | LoginPage | n/a | exception: public auth page | n/a | none | n/a | [x] |
| `/forgot-password` | ForgotPasswordPage | n/a | exception: public auth page | n/a | none | n/a | [x] |
| `/reset-password` | ResetPasswordPage | n/a | exception: public auth page | n/a | none | n/a | [x] |
| `/requests/:id/print` | RequestPrintPage | n/a | exception: print page | n/a | none | n/a | [x] |
| `/transmittals/:id/print` | TransmittalPrintPage | n/a | exception: print page | n/a | none | n/a | [x] |
| `/` | DashboardRouter | all | PageHeader (9 roles); HR dashboard has none | ⌂ only (no resource match) | ⌂ › Dashboard | fallback entry + HR dashboard to PageHeader | [x] |
| `/dashboard` | DashboardRouter | all | PageHeader (9 roles); HR dashboard has none | ⌂ › Dashboard | ⌂ › Dashboard | HR dashboard to PageHeader | [x] |
| `/ai-insights` | Navigate | n/a | redirect to /dashboard | n/a | none | n/a | [x] |
| `/ai-validation-reference` | AiValidationReferencePage | all | PageHeader | ⌂ › AI Validation Reference | ⌂ › AI Validation Reference | none | [x] |
| `/design-system` | Suspense | n/a | exception: dev-only design-system page | n/a | none | n/a | [x] |
| `/reports` | SharedReports | Own, PM, HR, Fin | PageHeader | ⌂ › Reports | ⌂ › Reports | none | [x] |
| `/blueprint-reviews` | SharedBlueprintReviews | all | PageHeader | ⌂ only (no resource match) | ⌂ › Blueprint reviews | fallback entry | [x] |
| `/resources` | SharedResources | PM | PageHeader | ⌂ › Resources | ⌂ › Resources | none | [x] |
| `/archive` | SharedArchiveSearch | Adm, PM, Arch | PageHeader | ⌂ › Archive search | ⌂ › Archive search | none | [x] |
| `/legacy-import` | SharedLegacyImport | Adm, PM, Arch | PageHeader | ⌂ › Legacy import | ⌂ › Legacy import | none | [x] |
| `/projects` | PMProjects | PM, Eng | PageHeader | ⌂ › Projects | ⌂ › Projects | none | [x] |
| `/projects/create` | ProjectCreatePage | PM, Eng | none (ProjectCreatePage, custom h1) | ⌂ › Projects › Create | ⌂ › Projects › New project | move to PageHeader; breadcrumbLabel "New project" | [x] |
| `/projects/new` | ProjectCreatePage | PM, Adm | none (same component) | ⌂ only (no resource match) | ⌂ › Projects › New project | fallback entry + move to PageHeader | [x] |
| `/projects/:projectId` | ProjectDetailPage | PM, Adm, Eng, Arch, Con | custom h1 (ProjectDetailPage) | ⌂ only (no resource match) | ⌂ › Projects › <project name> | fallback entry + PageHeader + record name | [x] |
| `/workflows` | PMWorkflows | PM | none (custom h2 "Workflow builder") | ⌂ › Workflows | ⌂ › Workflows | move to PageHeader | [x] |
| `/approvals` | PMApprovals | PM, HR, Fin, Arch, Eng, Con | none (panels only) | ⌂ › Approvals | ⌂ › Approvals | add PageHeader | [x] |
| `/documents` | DocumentsRouter | PM, SP | PageHeader | ⌂ › Documents | ⌂ › Documents | none | [x] |
| `/employees` | HREmployees | HR | local HR PageHeader (no breadcrumb) | ⌂ › Employees | ⌂ › Employees | local PageHeader wraps shared one | [x] |
| `/employees/create` | EmployeeCreatePage | HR | none (EmployeeCreatePage) | ⌂ › Employees › Create | ⌂ › Employees › Add employee | move to PageHeader; breadcrumbLabel "Add employee" | [x] |
| `/employees/edit/:id` | EmployeeCreatePage | HR | none | ⌂ › Employees › Edit | ⌂ › Employees › Edit employee | PageHeader; breadcrumbLabel "Edit employee" | [x] |
| `/employees/new` | EmployeeCreatePage | HR, Adm, IT | none | ⌂ only (no resource match) | ⌂ › Employees › Add employee | fallback entry + PageHeader | [x] |
| `/employees/:id/edit` | EmployeeCreatePage | HR, Adm, IT | none | ⌂ only (no resource match) | ⌂ › Employees › Edit employee | fallback entry + PageHeader | [x] |
| `/attendance` | AttendanceRouter | HR, SP | shared PageHeader (site personnel) / local HR PageHeader (HR) | ⌂ › Attendance | ⌂ › Attendance | HR branch via local wrapper | [x] |
| `/payroll` | HRPayroll | HR | local HR PageHeader (no breadcrumb) | ⌂ › Payroll | ⌂ › Payroll | local PageHeader wraps shared one | [x] |
| `/workforce-reports` | HRWorkforce | HR | local HR PageHeader (no breadcrumb) | ⌂ › Workforce Reports | ⌂ › Workforce Reports | local PageHeader wraps shared one | [x] |
| `/budget` | FinanceBudget | Fin | PageHeader | ⌂ › Budget | ⌂ › Budget | none | [x] |
| `/expenses` | FinanceExpenses | Fin | PageHeader | ⌂ › Expenses | ⌂ › Expenses | none | [x] |
| `/payroll-review` | FinancePayrollReview | Fin | custom h1 (twice) | ⌂ › Payroll Review | ⌂ › Payroll Review | move to PageHeader | [x] |
| `/impact-review` | FinanceImpactReview | Fin | PageHeader | ⌂ › Impact Review | ⌂ › Impact Review | none | [x] |
| `/designs` | ArchitectDesigns | Arch | PageHeader | ⌂ › Designs | ⌂ › Designs | none | [x] |
| `/designs/new` | ArchitectDesignCreate | Arch | none (custom header) | ⌂ › Designs › Show | ⌂ › Designs › New design | PageHeader; breadcrumbLabel "New design" | [x] |
| `/designs/:id` | ArchitectDesignDetail | Arch | PageHeader | ⌂ › Designs › Show | ⌂ › Designs › <design name> | pass record name | [x] |
| `/proposals` | ArchitectProposals | Arch, Con | PageHeader | ⌂ › Proposals | ⌂ › Proposals | none | [x] |
| `/architect/projects` | ArchitectProjects | Arch | PageHeader | ⌂ › Projects | ⌂ › Projects | none | [x] |
| `/revisions` | ArchitectRevisions | Arch | PageHeader | ⌂ › Revisions | ⌂ › Revisions | none | [x] |
| `/architect/documents` | ArchitectDocumentation | Arch | PageHeader | ⌂ › Documentation | ⌂ › Documentation | none | [x] |
| `/blueprints` | ArchitectBlueprints | Arch | PageHeader | ⌂ › Blueprints | ⌂ › Blueprints | none | [x] |
| `/requests` | SharedRequests | Adm, PM, Arch, Eng, Con | PageHeader | ⌂ › Requests | ⌂ › Requests | none | [x] |
| `/my-claims` | SharedClaims | PM, HR, Arch, Eng, SP | PageHeader | ⌂ › My claims | ⌂ › My claims | none | [x] |
| `/transmittals` | SharedTransmittals | all | PageHeader | ⌂ only (no resource match) | ⌂ › Transmittals | fallback entry | [x] |
| `/progress` | EngineerProgress | Eng | PageHeader | ⌂ › Progress | ⌂ › Progress | none | [x] |
| `/requirements` | EngineerRequirements | Eng, SP | PageHeader | ⌂ › Requirements | ⌂ › Requirements | none | [x] |
| `/issues` | IssuesRouter | PM, Eng, SP | PageHeader | ⌂ › Issues | ⌂ › Issues | none | [x] |
| `/tasks` | SPTasks | PM, Eng, SP | PageHeader | ⌂ › Tasks | ⌂ › Tasks | none | [x] |
| `/advisory-docs` | ConsultantAdvisoryDocs | Con | PageHeader | ⌂ › Advisory Docs | ⌂ › Advisory Docs | none | [x] |
| `/consultant/proposals` | ConsultantProposals | Con | PageHeader | ⌂ › Proposal Review | ⌂ › Proposal Review | none | [x] |
| `/consultant/designs` | ConsultantDesigns | Con | PageHeader | ⌂ › Designs | ⌂ › Designs | none | [x] |
| `/consultant/projects` | ConsultantProjects | Con | PageHeader | ⌂ › Projects | ⌂ › Projects | none | [x] |
| `/consultant/design-reviews` | ConsultantDesignReviews | Con | PageHeader | ⌂ only (no resource match) | ⌂ › Design reviews | fallback entry | [x] |
| `/admin/projects` | AdminProjects | Adm, IT | PageHeader | ⌂ › Projects | ⌂ › Projects | none | [x] |
| `/admin/workflows` | AdminWorkflows | Adm, IT | none (same screen as PM workflows) | ⌂ › Workflows | ⌂ › Workflows | follows /workflows | [x] |
| `/admin/documents` | AdminDocuments | Adm, IT | PM documents re-export | ⌂ › Documents | ⌂ › Documents | none (check) | [x] |
| `/admin/activity-logs` | AdminActivityLogs | Adm | PageHeader | ⌂ › Activity Logs | ⌂ › Activity Logs | none | [x] |
| `/admin/security` | AdminSecurity | Adm | PageHeader | ⌂ › Security | ⌂ › Security | none | [x] |
| `/admin/roles-permissions` | AdminRolesPermissions | Adm | PageHeader | ⌂ › Roles & Permissions | ⌂ › Roles & Permissions | none | [x] |
| `/admin/workflow-configuration` | AdminWorkflowConfiguration | Adm, IT | PageHeader | ⌂ › Workflow Configuration | ⌂ › Workflow Configuration | none | [x] |
| `/admin/approval-hierarchy` | AdminApprovalHierarchy | Adm, IT | PageHeader | ⌂ › Approval Hierarchy | ⌂ › Approval Hierarchy | none | [x] |
| `/admin/support` | AdminSupport | Adm | PageHeader | ⌂ › User Support | ⌂ › User Support | none | [x] |
| `/owner/portfolio` | OwnerPortfolio | Own | PageHeader | ⌂ › Portfolio | ⌂ › Portfolio | none | [x] |
| `/owner/proposals` | OwnerProposals | Own | PageHeader | ⌂ › Proposals | ⌂ › Proposals | none | [x] |
| `/owner/audit-trail` | AdminActivityLogs | Own | PageHeader | ⌂ › Audit Trail | ⌂ › Audit Trail | none | [x] |
| `/owner/oversight` | AttentionCard | Own | PageHeader (via AdminSecurity), AttentionCard above | ⌂ › System Oversight | ⌂ › System Oversight | none | [x] |
| `/owner/account-recovery` | OwnerAccountRecovery | Own | PageHeader | ⌂ › Account Recovery | ⌂ › Account Recovery | none | [x] |
| `/it-designer/users` | ITDesignerUsers | IT | PageHeader | ⌂ › User Accounts | ⌂ › User Accounts | none | [x] |
| `/it-designer/proposals` | ITDesignerProposals | IT | PageHeader | ⌂ › Proposals | ⌂ › Proposals | none | [x] |
| `/it-designer/roles-permissions` | AdminRolesPermissions | IT | PageHeader | ⌂ › Roles & Permissions | ⌂ › Roles & Permissions | none | [x] |
| `/it-designer/activity-logs` | AdminActivityLogs | IT | PageHeader | ⌂ › Activity Logs | ⌂ › Activity Logs | none | [x] |
| `/it-designer/security` | AdminSecurity | IT | PageHeader | ⌂ › Security | ⌂ › Security | none | [x] |
| `/it-designer/support` | AdminSupport | IT | PageHeader | ⌂ › User Support | ⌂ › User Support | none | [x] |
| `*` | NotFoundPage | n/a | exception: 404 page | n/a | none | n/a | [x] |
## Findings beyond the brief's list

- The HR pages (`/employees`, `/payroll`, `/workforce-reports`, HR branch of `/attendance`) use a **local** `PageHeader` exported from `pages/roles/shared/shared-hr.tsx` (own `<h1>`, no breadcrumb), not the shared one. Fix: make that local component a thin wrapper over the shared `PageHeader` so all four pages gain the breadcrumb without changing their call sites.
- `ListViewHeader`, `CreateViewHeader`, `ShowViewHeader` and `EditViewHeader` each render their own `<Breadcrumb />`. No page outside `components/refine-ui/views` uses them, so they only need the new `breadcrumbLabel` prop for completeness.
- `Breadcrumb` renders the last crumb as a `BreadcrumbPage` directly inside the `<ol>` (not in an `<li>`); the home icon link has no accessible name; the `<nav>` label is lowercase `breadcrumb`.
- `/blueprint-reviews` and `/transmittals` are reachable by every authenticated role per `App.tsx` comments; there is no resource, so the role column is "all".
- `/admin/documents` re-exports the PM documents page, which already uses `PageHeader`, so it needs nothing (the F6 lead was wrong for it).

## What was changed (Phase 2 and 3)

- `components/refine-ui/layout/breadcrumb.tsx`: crumbs now come from `resolveTrail` (Refine's when it returns any, else the fallback list); every crumb sits in an `<li>`; `<nav aria-label="Breadcrumb">`; home link has `aria-label="Home"` and a visible focus outline; the last crumb is never a link, truncates with an ellipsis and has a `title`; optional `label` prop replaces the last crumb.
- `components/refine-ui/views/page-header.tsx` and the four `*View` headers: new optional `breadcrumbLabel` prop. Without it nothing changes.
- `config/breadcrumb-routes.ts` (fallback list and documented exceptions) and `lib/breadcrumb-trail.ts` (pure logic, tested in `breadcrumb-trail.test.ts`, including a test that fails when an `App.tsx` route is neither matched by a resource, nor in the fallback list, nor an exception).
- `components/ui/multi-step-page.tsx`: its own `<h2>` header replaced by the shared `PageHeader` with `breadcrumbLabel={title}`. This one change fixes the create/edit wizards for projects (`/projects/create`, `/projects/new`), employees (4 routes) and designs (`/designs/new`).
- `pages/roles/shared/shared-hr.tsx`: the HR `PageHeader` now wraps the shared one (fixes `/employees`, `/payroll`, `/workforce-reports`, HR `/attendance`).
- Moved to `PageHeader`, keeping every button and description: `pm-workflows`, `admin-workflows`, `pm-approvals` (header added), `finance-payroll-review` (both states), `ProjectDetailPage` (record name; loading and not-found states too), `hr-dashboard` (title "HR Dashboard", description is the old "Current section" line, Export and Add employee kept), `architect-design-detail` (record name; loading and not-found states).
- Two lint errors that already existed in `hr-dashboard.tsx` (unused `ArrowUpRight` import, unused `showEmployeeModal` value) were fixed so the changed file lints clean. No behavior change.

## Sidebar label, breadcrumb and page title mismatches (left alone)

| Route | Sidebar / breadcrumb | Page title |
|---|---|---|
| `/workflows` | Workflows | Workflow builder |
| `/admin/workflows` | Workflows | Workflow oversight |
| `/dashboard` (HR) | Dashboard | HR Dashboard |
| `/dashboard` (other roles) | Dashboard | Welcome / overview lines, "Design Studio", "Finance Dashboard" |
| `/projects/new`, `/projects/create` | Projects › New project | New project (matches) |
| `/blueprint-reviews` | Blueprint reviews (fallback entry) | Blueprint reviews (matches) |

## Known limits

- The `Header today` and `Breadcrumb today` columns are derived, not observed (see the top of this file).
- Tab/panel content that contains its own heading (for example the Consultant proposal detail `<h1>`) is below the page header and was not changed.
