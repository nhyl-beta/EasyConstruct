# EasyConstruct

EasyConstruct is a full-stack construction management platform built as a thesis project. It coordinates projects, employees, HR operations, finance, engineering workflows, and documents for construction firms, with role-based dashboards for everyone from site engineers to owners.

## Tech stack

**Frontend** — React 19, [Refine](https://refine.dev/) (`@refinedev/react-router`), React Router, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Table/Query (via Refine hooks), Recharts.

**Backend** — Node.js, Express 5, Drizzle ORM, PostgreSQL ([Neon serverless driver](https://neon.tech/)), JWT auth, Multer for uploads, stored on an S3-compatible bucket (Filebase / MinIO), Vercel Blob, or local disk.

## Project structure

```
.
├── apps/
│   ├── web/          # React + Refine frontend (Vite)
│   └── api/          # Express + Drizzle REST API
│       ├── src/core/ # HTTP, auth, storage, database, jobs and shared plumbing
│       ├── src/modules/ # API features and their public module indexes
│       ├── drizzle/  # SQL migrations and schema snapshots
│       └── scripts/{ops,demo}/
├── packages/        # Shared role ids and TypeScript/ESLint configuration
├── infra/           # Dockerfiles and local PostgreSQL/MinIO Compose stack
├── docs/            # Architecture, ADRs, setup and history
└── scripts/dev.mjs  # Runs the web and API development servers together
```

The API modules (IAM, documents, projects, design, workflow, workforce, finance, insights, and platform) use a consistent layering pattern: **schema → repository → service → controller → routes**. The frontend remains in its existing feature-folder structure. See [the architecture guide](docs/architecture/structure.md) for the complete tree and import rules.

## Prerequisites

- Node.js 18+ (tested on Node 22)
- A PostgreSQL database (the project is built against [Neon](https://neon.tech/), but any Postgres instance works)

## Getting started

### 1. Clone and install dependencies

```bash
git clone https://github.com/nhyl-beta/construction-system-easyconstruct.git
cd construction-system-easyconstruct
npm ci
```

### 2. Configure environment variables

Create a `.env` file inside `apps/api/` with at least:

```bash
DATABASE_URL=postgresql://user:password@host/dbname
PORT=8000
JWT_SECRET=change-me-in-prod
CORS_ORIGIN=http://localhost:5173
# Origin the browser app is served from — used to build the link in recovery /
# password-reset emails (CLIENT_URL is accepted too). Defaults to CORS_ORIGIN. The
# link opens on the RECIPIENT's machine, so set the real public URL when deployed.
APP_URL=http://localhost:5173
# Email (Gmail SMTP) for Owner fail-safe recovery and forgot-password. Gmail needs
# 2-Step Verification on the sending account plus an App Password — the normal
# Gmail password does not work. Without these the API answers 503, never a fake "sent".
MAIL_USER=your.sending.account@gmail.com
MAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
# Optional — enables Vercel Blob storage for uploads (the store is PRIVATE; files are
# served through the authenticated GET /api/uploads/file route). Falls back to local
# disk (apps/api/uploads) in development if unset.
BLOB_READ_WRITE_TOKEN=
# Optional — S3-compatible storage (Filebase, MinIO). When all of these are set it wins over Blob.
# S3_ENDPOINT=  S3_REGION=us-east-1  S3_BUCKET=  S3_ACCESS_KEY_ID=  S3_SECRET_ACCESS_KEY=
# Behind a reverse proxy (Render): TRUST_PROXY=1. Without a scheduler: DISABLE_SCHEDULER=true.
# Decision-support layer (proposal validation, cost comparison, advisory
# signals, suggested plans, task allocation advice, impact forecasts).
# ON by default; set false to switch it all off. Rule-based advice only: a
# person always decides.
FEATURE_AI=true
# Secret for scheduled jobs on Vercel (/api/cron/*). Leave empty locally.
CRON_SECRET=
```

The client reads `VITE_API_BASE` to decide whether to talk to the real API or use mock data; set it in a `.env` file inside `apps/web/` (e.g. `VITE_API_BASE=http://localhost:8000` — **no `/api` suffix**: `apps/web/src/services/api.client.ts`'s `apiUrl()` always appends `/api` itself, so a value ending in `/api` here produces a double `/api/api/...` and every request 404s) once the server is running. Decision-support surfaces are on by default on the client too; set `VITE_FEATURE_AI=false` (separate flag, separate `.env`, same gate) together with the server's `FEATURE_AI=false` to hide them.

For the hosted setup (Cloudflare Pages + Render + Filebase + GitHub Actions) — environment variable matrix, build settings, backups, restore and rollback — see [docs/architecture/deployment.md](docs/architecture/deployment.md). The web app also needs `VITE_API_BASE` (origin) and `VITE_API_URL` (origin + `/api`) there; see `apps/web/.env.example`.

### 3. Set up the database

For a local PostgreSQL 16 instance and S3-compatible MinIO service, start the provided Compose stack:

```bash
docker compose -f infra/compose/docker-compose.yml up -d
```

See [local infrastructure](infra/compose/README.md) for connection details. Demo seed/reset scripts refuse to run with `NODE_ENV=production` and require the configured local demo safeguards.

From the repository root:

```bash
npm run db:generate --workspace=@easyconstruct/api   # generate Drizzle migrations from the schema (if needed)
npm run db:migrate --workspace=@easyconstruct/api    # apply migrations to DATABASE_URL
ALLOW_DEMO_RESET=true npm run db:seed    # guarded demo schema top-ups and demo accounts
```

The seed script prints a table of demo accounts on completion — one per role (admin, project manager, HR, finance, architect, engineer, site personnel, consultant, owner, IT designer), all sharing the password `Demo@12345`.

### 4. Run the app

From the repository root, run client and server together:

```bash
npm run dev
```

Or run them individually:

```bash
npm run dev:client   # Vite dev server, default http://localhost:5173
npm run dev:server   # Express API with hot reload (tsx watch), default http://localhost:8000
```

## Available scripts

**Root**

| Script | Description |
| --- | --- |
| `npm run dev` | Runs both client and server dev servers concurrently |
| `npm run dev:client` | Runs only the frontend dev server |
| `npm run dev:server` | Runs only the backend dev server |
| `npm run build:client` | Builds the frontend for production |
| `npm run build:server` | Builds the backend for production |
| `npm run db:seed` | Seeds demo accounts and roles (proxies to the API workspace) |

**API workspace (`apps/api/`)**

Run these commands from `apps/api/` unless a workspace selector is shown.

| Script | Description |
| --- | --- |
| `npm run dev` | Starts the API with hot reload |
| `npm run build` | Compiles TypeScript to `dist/` |
| `npm start` | Runs the compiled server |
| `npm run db:generate` | Generates Drizzle migrations from the schema |
| `npm run db:migrate` | Applies migrations to the database |
| `npm run db:seed` | Seeds demo roles, employees, and user accounts |
| `npm run db:backfill-employee-links` | Backfills employee ↔ user links |
| `npm run ai:seed-references` | Pulls the EstimationPro.ai cost-reference catalog (idempotent upsert) |
| `npm run demo:seed` | Creates `DEMO-STAGE-0`..`6`, one demo project per lifecycle phase, via real API calls against a running `npm run dev` server. Idempotent — deletes and rebuilds its own rows on every run. Run `ai:seed-references` first for a full cost-reference catalog (falls back to a single seeded reference row otherwise — see `apps/api/scripts/demo/demo-seed-stages.ts`'s header comment). |
| `npm run demo:ai-signals` | The one bookmarkable place to see the AI-validation decision-support layer trip all five advisory signals at once (cost-variance, cumulative-change-impact, burn-vs-progress, issue-recurrence, stalled-stage) — see "AI-validation demo project" below. |

**AI-validation demo project.** `npm run demo:ai-signals` builds a single project at the stable
code **`AISIG-DEMO`** (overridable via `AISIG_PROJECT_CODE`), deliberately engineered to trip
all five advisory signals, then asserts the live API's gate checks are byte-for-byte identical
to a direct, signals-bypassing call — proving decision support never affects gating. The script
is idempotent (it clears out any previous `AISIG-DEMO` run before rebuilding), so **the 7
`DEMO-STAGE-0`..`6` projects from `demo:seed` deliberately don't carry this scenario
themselves** — the script's own console output prints the project's numeric id and
`/projects/:id` link on every run; open that link as Project Manager, Consultant, Finance
Manager or Engineer (the five signals' `ownerRoles`) to see `DecisionSupportSection` under the
gate checklist with all five signals live.

**Web workspace (`apps/web/`)**

Run these commands from `apps/web/`.

| Script | Description |
| --- | --- |
| `npm run dev` | Starts the Refine/Vite dev server |
| `npm run build` | Type-checks and builds for production |
| `npm start` | Serves a production build with Refine's static server |

## Roles

The platform supports the following roles, each with its own dashboard and permissions: Admin, Owner, IT Designer, Human Resources, Finance Manager, Project Manager, Architect, Engineer, Site Personnel, and Consultant.

## License

No license has been specified for this project.
