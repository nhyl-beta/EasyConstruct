# EasyConstruct Codebase Memory

**Repository:** `construction-system-easyconstruct`  
**Inspected:** 2026-09-07  
**Branch/HEAD at inspection:** `main` / `1e3a376` (`Updated user components`)  
**Purpose:** source-of-truth orientation for future engineering work

## 1. Executive summary

EasyConstruct is a two-package TypeScript application for construction-project
operations:

- `client/` is a Vite + React 19 + React Router + Refine application using
  Tailwind/shadcn-style UI components.
- `server/` is an Express 5 + Drizzle ORM + PostgreSQL/Neon API.
- `scripts/dev.mjs` starts both packages for local development.
- `server/drizzle/` contains five generated PostgreSQL migrations.
- The UI is substantially broader than the currently mounted API. Several
  screens still use `client/src/providers/mock-data.ts`, while project/design/
  proposal/blueprint/document features have real HTTP controllers or
  repositories.

  The Human Resources module is now an exception: employee CRUD, attendance,
  payroll generation, tracksheet/gross labor/gross tracking endpoints, and
  workforce reporting are persisted through `server/src/hr/` and mounted at
  `/api/hr`. HR pages use `client/src/features/hr/` hooks. See
  `docs/HR_MODULE_IMPLEMENTATION.md` for the endpoint contract and calculation
  rules.

The repository is a working development prototype rather than a complete,
uniformly production-hardened system. The most important operational facts are:

1. The client protects routes by the presence of browser-stored token/user
   values; the server does not currently authenticate application API requests.
2. Authentication, projects, HR, designs, proposals, design revisions, design
   reviews, architect documents, and blueprints are mounted in
   `server/src/app.ts`. HR endpoints are under `/api/hr`.
3. Finance route modules exist, but the aggregate finance router is not mounted
   and it imports several directories that are absent from the repository.
4. The client and server build commands currently pass. The server test script is
   still the default failing placeholder and no first-party test suite was
   found.

## 2. Repository map

```text
.
├─ package.json                 # root orchestration scripts
├─ scripts/dev.mjs              # starts client and server together
├─ client/
│  ├─ package.json
│  ├─ vite.config.ts            # Vite, @ alias, /api -> localhost:8000
│  ├─ src/
│  │  ├─ App.tsx                # Refine providers and all client routes
│  │  ├─ auth/                  # browser-session auth context
│  │  ├─ components/            # layout, auth, Refine and UI components
│  │  ├─ config/                # roles, resources, statuses, icons
│  │  ├─ features/              # feature controllers/hooks/types/pages
│  │  ├─ hooks/                 # auth and role helpers
│  │  ├─ pages/roles/           # role-specific and shared screens
│  │  ├─ providers/             # Refine data/access providers and mock data
│  │  └─ services/              # fetch/axios API wrappers
│  └─ dist/                     # generated build output; do not edit
├─ server/
│  ├─ package.json
│  ├─ src/
│  │  ├─ app.ts                 # Express middleware and mounted routes
│  │  ├─ auth/                  # login controller/service/repository/types
│  │  ├─ db/                    # connection, schema, seed
│  │  ├─ finance/               # finance modules, partially integrated
│  │  ├─ middleware/            # CORS, errors, logging, IDs, validation
│  │  ├─ validators/            # Zod validators and auth route
│  │  └─ <feature>/             # controller/repository/service/routes/types
│  ├─ drizzle/                  # generated SQL migrations and metadata
│  └─ .env                      # local configuration; contains redacted secrets
├─ docs/                        # development notes and this memory document
└─ .gitignore
```

`node_modules/` directories are present locally but are generated dependencies,
not application source and are intentionally excluded from this map.

## 3. How the application runs

### Development

From the repository root:

```bash
npm install
npm run dev
```

The root `dev` script runs `scripts/dev.mjs`, which starts:

- client: `npm --prefix client run dev` (normally Vite on port 5173)
- server: `npm --prefix server run dev` (tsx watch, normally port 8000)

`client/vite.config.ts` proxies `/api` to `http://localhost:8000`.

### Builds

```bash
npm run build:client
npm run build:server
```

The client build runs `tsc` followed by `refine build`; the server build runs
`tsc --noCheck`. At inspection time both commands completed successfully. The
client build emitted a Rollup warning about large JavaScript chunks; this is a
performance warning, not a build failure.

### Database commands

The root exposes:

```bash
npm run db:seed
```

This delegates to `server/src/db/seed.ts`. The server package also defines
`db:generate`, `db:migrate`, and `db:crud`. `DATABASE_URL` is required by
`server/src/config/env.ts` and `server/drizzle.config.ts`.

### Tests

`server/package.json` has a `test` script that prints an error and exits with
status 1. No first-party `client` or `server` test files were found outside
dependencies. Existing documentation describes manual checks, but those are
not an automated regression suite.

## 4. Frontend architecture

### Application shell and routing

`client/src/index.tsx` mounts `App`. `client/src/App.tsx` creates:

1. `BrowserRouter`
2. `AuthProvider`
3. Refine Kbar, theme, devtools, data provider, access-control provider,
   notification provider, and `Refine`
4. public auth routes
5. protected routes inside the shared `Layout`

Public routes:

- `/login`
- `/forgot-password`
- `/reset-password`

Protected client routes currently declared in `App.tsx` include:

- `/` and `/dashboard`
- `/ai-insights`, `/reports`, `/resources`
- `/projects`, `/projects/new`, `/projects/create`
- `/workflows`, `/approvals`, `/documents`
- `/employees`, `/employees/new`, `/employees/create`
- `/attendance`, `/payroll`
- `/budget`, `/expenses`, `/payroll-review`, `/impact-review`
- `/designs`, `/designs/new`, `/designs/:id`, `/proposals`
- `/architect/projects`, `/revisions`, `/reviews`, `/architect/documents`,
  `/blueprints`
- `/progress`, `/requirements`, `/issues`, `/tasks`, `/advisory-docs`

`ProtectedRoutes` redirects when no browser session is found.
`PublicAuthRoute` redirects an already-signed-in user to `/dashboard`.
`getDashboardRoute` currently returns `/dashboard` for every role.

### Role and dashboard behavior

Backend role strings are translated by
`client/src/config/role-mapping.ts` to frontend keys such as
`project_manager`, `human_resources`, and `finance_manager`.
`client/src/config/role-tab.ts` defines labels, sidebar sections, tabs, and
primary actions. `client/src/providers/access-control-provider.ts` applies
resource allowlists from `client/src/config/role-resources.ts`.

`client/src/pages/dashboard/index.tsx` has dedicated dashboards for:

- project manager
- human resources
- finance manager
- architect

Other roles use the explicit “coming soon” fallback. The role configuration
contains additional placeholder navigation entries and TODO notes that route
some items back to `/dashboard` or to paths without corresponding `App.tsx`
routes.

### Data access

There are multiple client data-access patterns:

- `client/src/providers/data.ts`: Refine REST-style CRUD provider against
  `VITE_API_URL` or `/api`; list totals fall back to current-page length.
  `getMany`, bulk mutations, and `custom` are intentionally unimplemented.
- `client/src/services/api.client.ts`: small fetch wrapper using
  `VITE_API_BASE` plus `/api`.
- `client/src/services/api.ts`: axios wrapper using `VITE_API_BASE_URL` and
  `VITE_USE_API`; this is a separate configuration convention.
- Feature-specific controllers under `client/src/features/` call `/api/...`
  directly.
- `client/src/features/projects/repositories/project.repository.ts` switches
  between mock data and HTTP based on whether `VITE_API_BASE` is set.

These conventions are not fully consolidated. A future change should identify
which provider a screen actually uses before changing API configuration.

## 5. Backend architecture

### Request pipeline

`server/src/app.ts` installs JSON parsing, CORS, request IDs, logging, mounted
API routers, and the final error middleware. The server entry points are:

- `server/src/index.ts`: local/listening entry using validated `env`
- `server/index.ts`: Vercel-compatible export and local listener

Feature folders generally follow:

```text
routes -> controller -> service -> repository -> Drizzle schema/database
```

Validation is implemented with Zod through
`server/src/middleware/validate.ts` and feature validators.

### Mounted API surface (source of truth: `server/src/app.ts`)

The following prefixes are currently mounted:

| Prefix | Implemented operations |
|---|---|
| `/api/auth` | `POST /login` |
| `/api/projects` | list, create, get by id, patch, delete |
| `/api/designs` | list, create, get by id, patch, delete |
| `/api/proposals` | list, create, get by id, patch, delete |
| `/api/design-revisions` | list, create, get by id, patch, delete |
| `/api/design-reviews` | list, create, get by id, decide, delete |
| `/api/architect-documents` | list, create, get by id, patch, delete |
| `/api/blueprints` | list, create, get by id, patch, delete |

The common response helper is `server/src/utils/response.ts`; the client data
provider expects `{ success, message, data }` envelopes.

### Finance integration status

`server/src/routes/finance.ts` defines an aggregate `/api/finance` router and
references budgets, budget adjustments, budget approval steps, expenses,
purchase requests, reimbursements, procurement, approvals, AI insights, risks,
reports, cash flow, project profitability, and summary routes.

However:

- `server/src/app.ts` does not import or mount `financeRouter`.
- The aggregate router imports these absent directories:
  `server/src/finance/ai-insights`,
  `server/src/finance/approvals`,
  `server/src/finance/procurement`,
  `server/src/finance/purchase-requests`,
  `server/src/finance/reimbursements`,
  `server/src/finance/reports`, and
  `server/src/finance/risks`.
- Some finance route modules that do exist are therefore not reachable through
  the current Express app.

Finance client hooks call `/api/finance/...`, so those screens should be treated
as incomplete until route registration and the missing modules are reconciled.

## 6. Authentication, authorization, and roles

### Login flow

The implemented login path is:

```text
client login form
  -> POST /api/auth/login
  -> Zod login validator
  -> users lookup by email
  -> bcrypt password comparison
  -> JWT signed for 8 hours
  -> { token, user } response
  -> sessionStorage or localStorage
  -> /dashboard
```

Relevant files:

- `client/src/hooks/use-auth-controllers.ts`
- `client/src/auth/auth-context.tsx`
- `client/src/components/auth/auth-routes.tsx`
- `server/src/validators/auth-validators.ts`
- `server/src/validators/routes.ts`
- `server/src/auth/controller.ts`
- `server/src/auth/service.ts`
- `server/src/auth/repository.ts`
- `server/src/db/schema/users.ts`
- `server/src/db/seed.ts`

The seed defines nine development-only role records (super admin, admin,
human resources, finance manager, project manager, architect, engineer, site
personnel, and consultant). This document intentionally omits development
passwords and credential values.

### Security boundaries and limitations

- `ProtectedRoutes` checks only whether the browser has both token and user
  values; it does not decode, refresh, or verify the JWT.
- `server/src/app.ts` does not install JWT authentication middleware on the
  application routes. The token is created at login but is not enforced by the
  mounted feature routers.
- Logout is client-side storage clearing; there is no server logout or token
  revocation endpoint.
- `useForgotPasswordController` and `useResetPasswordController` call
  `/api/auth/forgot-password` and `/api/auth/reset-password`, but only
  `POST /api/auth/login` is currently registered.
- `server/src/config/env.ts` validates a `JWT_SECRET`, while
  `server/src/auth/service.ts` independently reads `process.env` and has a
  development fallback. These are two configuration paths and should not be
  assumed equivalent.
- `server/.env` exists locally. It contains database/JWT configuration and is
  not reproduced here; secrets and production credentials must remain out of
  documentation and source control.

The access-control provider improves UI-level role gating, but it is not a
substitute for server-side authorization.

## 7. Database and migrations

### Connection and ORM

`server/src/db/connection.ts` creates a `pg` pool from `env.DATABASE_URL` and
passes the schema exported by `server/src/db/schema/index.ts` to Drizzle.
`server/drizzle.config.ts` targets PostgreSQL, reads `src/db/schema`, and
writes migrations to `server/drizzle/`.

### Schema areas

The schema directory contains tables for:

- users and roles
- projects
- designs, design revisions, design reviews, blueprints, architect documents
- proposals and general documents
- employees, attendance, payroll, notifications, audit logs
- finance budgets, allocations, adjustments, approval steps, history,
  comments, documents, expenses, cash flow, payroll batches, and related
  finance records

The aggregate export is narrower than the directory: `schema/index.ts` only
re-exports `schema/app.ts`, and `schema/app.ts` currently exports attendance,
documents, employees, notifications, payroll, projects, proposals, roles,
users, and the commented relations module. Design-specific and finance schema
files exist and are imported directly by some feature modules, but they are not
all part of the schema object supplied by `db/connection.ts`.

Most tables use serial IDs or feature-specific string IDs. The migration files
show that finance and design tables were added after the original base tables.
`server/src/db/schema/relations.ts` currently contains only commented example
relations; most relationships are represented as scalar foreign-key columns and
migration constraints rather than active Drizzle relation definitions.

### Seed data

`server/src/db/seed.ts` upserts development users by unique email and inserts a
small set of mock projects. It is development/test data, not a production
bootstrap process. The project seed values intentionally resemble the
client's mock project data, but the client and server are not automatically
kept in sync.

## 8. Mock data versus real data

`client/src/providers/mock-data.ts` is still imported by project-manager and HR
screens, shared HR content, and project repository fallback behavior. This
means a successful page render does not prove that the page is connected to
PostgreSQL.

Real or intended API-backed areas include:

- projects through `ProjectRepository` when `VITE_API_BASE` is set
- designs and design details/revisions
- proposals
- design reviews
- architect documents
- blueprints
- finance hooks/controllers, although the server mounting is incomplete

Known integration risks:

- feature-specific fetch calls and the Refine data provider use different
  conventions for base URLs and response handling;
- the project repository uses project codes in its public API but translates to
  numeric backend IDs for patch/delete;
- backend status/tone/risk fields are free-text and require client-side
  normalization;
- several UI pages expose controls or navigation for endpoints not present in
  the mounted server.

## 9. Configuration conventions

### Client variables referenced in source

- `VITE_API_URL` — Refine data provider base, defaults to `/api`
- `VITE_API_BASE` — feature repository/fetch base switch
- `VITE_API_BASE_URL` — axios wrapper base
- `VITE_USE_API` — axios wrapper flag (not the project repository switch)

There is no checked-in client `.env.example` documenting these variants.

### Server variables referenced in source

- `PORT` (default 8000)
- `DATABASE_URL` (required)
- `NODE_ENV` (default `development`)
- `JWT_SECRET` (development fallback exists in source)
- `CORS_ORIGIN` (default `http://localhost:5173`)

Do not copy the local `server/.env` into documentation or commits. Use
environment-specific secret storage for real deployments.

## 10. Discrepancies and incomplete areas

The following are source-observed, actionable limitations rather than inferred
future work:

1. **Authorization enforcement gap:** client route/resource checks exist, but
   server feature routes have no JWT middleware or role checks.
2. **Auth endpoint mismatch:** forgot/reset UI calls are not mounted by the
   backend.
3. **Finance router mismatch:** the aggregate finance router is not mounted and
   imports missing modules.
4. **Role dashboard coverage:** only four roles have dedicated dashboard
   components; the dashboard router explicitly falls back for others.
5. **Navigation placeholders:** `client/src/config/role-tab.ts` contains TODOs
   and routes that intentionally land on dashboard or paths not declared in
   `App.tsx`.
6. **Data provider gaps:** bulk/custom Refine operations throw
   “not implemented” errors.
7. **Testing gap:** the server test command is a placeholder failure and no
   first-party automated tests were found.
8. **Configuration fragmentation:** three client API variable conventions and
   two server JWT-secret reads coexist.
9. **Migration/schema history:** the first migration creates `demo_users` and
   later drops it; current schema source should be preferred over historical
   migration names when reasoning about the live model.
10. **Documentation drift:** existing `docs/DEVELOPMENT_AUTH.md`,
    `docs/LOGIN_FIX.md`, and `docs/TEST_ACCOUNTS.md` describe prior manual
    verification and planned behavior. This memory document treats current
    source and current build results as authoritative where they differ.
11. **Schema export gap:** design and finance schema files are present under
    `server/src/db/schema/`, but the aggregate export used by
    `server/src/db/connection.ts` does not re-export all of them.

## 11. Git state and history

At inspection time the working tree was clean before this documentation file
was added. The repository is on `main` at `1e3a376`, with 14 commits in the
local history. Recent commit subjects show work on user components, logout,
Vercel setup, role interactions, finance changes, backend integration, and
project-manager pages. Commit subjects are historical context only; they do
not establish that every described feature remains mounted or complete.

## 12. Safe maintenance guidance

When changing this repository:

1. Verify the actual route in `client/src/App.tsx` and the actual server mount
   in `server/src/app.ts` before adding or editing a screen.
2. Trace a feature from page -> hook/controller -> fetch URL -> server route ->
   service/repository -> schema before calling it “API-backed”.
3. Keep backend role strings and frontend role mapping aligned.
4. Do not treat browser storage presence as proof of authenticated API access.
5. Use migrations and current schema together; do not edit generated migration
   history casually.
6. Keep secrets out of docs, commits, logs, and examples.
7. Run `npm run build:client` and `npm run build:server` after source changes.
8. If adding tests, replace the placeholder server test script with the
   repository's chosen test runner rather than assuming one is configured.

## 13. Important entry points

| Concern | Entry point |
|---|---|
| Local orchestration | `scripts/dev.mjs` |
| Client composition/routes | `client/src/App.tsx` |
| Client auth state | `client/src/auth/auth-context.tsx` |
| Client route protection | `client/src/components/auth/auth-routes.tsx` |
| Client role mapping | `client/src/config/role-mapping.ts` |
| Client UI ACL | `client/src/providers/access-control-provider.ts` |
| Client API provider | `client/src/providers/data.ts` |
| Server composition/routes | `server/src/app.ts` |
| Server local entry | `server/src/index.ts` |
| Auth API | `server/src/auth/` and `server/src/validators/routes.ts` |
| DB connection | `server/src/db/connection.ts` |
| DB schema exports | `server/src/db/schema/index.ts` |
| Development seed | `server/src/db/seed.ts` |
| Migrations | `server/drizzle/` |
| Environment parsing | `server/src/config/env.ts` |
