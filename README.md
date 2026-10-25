# EasyConstruct

**A role-based construction workflow management system.**

EasyConstruct is a full-stack web application that coordinates the project lifecycle of a construction firm: proposals, design and architectural review, scheduling and milestones, site operations, procurement, payroll, finance, and document control. Each stakeholder works in a dashboard tailored to their role.

The system was developed as a thesis project at STI College San Jose del Monte (BS Information Technology).

---

## Table of Contents

1. [Features](#1-features)
2. [Roles](#2-roles)
3. [Technology Stack](#3-technology-stack)
4. [Repository Structure](#4-repository-structure)
5. [Prerequisites](#5-prerequisites)
6. [Local Development Setup](#6-local-development-setup)
7. [Environment Variables](#7-environment-variables)
8. [Available Scripts](#8-available-scripts)
9. [Testing and Continuous Integration](#9-testing-and-continuous-integration)
10. [Deployment](#10-deployment)
11. [Security Notes](#11-security-notes)
12. [Documentation](#12-documentation)
13. [Project Information](#13-project-information)
14. [License](#14-license)

---

## 1. Features

| Area | Capabilities |
| --- | --- |
| **Project lifecycle** | Staged project workflow with gate checks, milestones with date validation, tasks, and project member assignment. |
| **Proposals and design** | Proposal intake and review, design requests, revisions, deliverables, transmittals, and architect documents. |
| **Site operations** | Attendance with live camera capture for site personnel, issue and finding reports, RFI and RFA workflows. |
| **Finance** | Cash-flow tracking, expense categories, procurement and reimbursement, payroll, payroll summaries, and reconciliation. |
| **Human resources** | Employee records, roles, and attendance-linked payroll. |
| **Documents** | Document types, versioned uploads, S3-compatible storage with integrity checks, and authenticated downloads. |
| **Decision support** | Rule-based advisory signals (cost variance, change impact, burn versus progress, issue recurrence, stalled stage). Advisory only; a person always decides. Can be disabled with a feature flag. |
| **Platform** | Role-based access control, audit logs, notifications, quick search, scheduled jobs, and account recovery by email. |

## 2. Roles

Ten roles are supported, each with its own dashboard and permissions:

Owner, Admin, IT Designer, Project Manager, Human Resources, Finance Manager, Architect, Engineer, Site Personnel, and Consultant.

## 3. Technology Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | React 19, Refine, React Router, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Table and Query, Recharts |
| **Backend** | Node.js, Express 5, TypeScript, Drizzle ORM, JWT authentication, Multer |
| **Database** | PostgreSQL (Neon in production) |
| **File storage** | S3-compatible object storage (Filebase in production, MinIO locally); local disk fallback in development |
| **Email** | SMTP (Brevo in production, Gmail App Password for local use) |
| **Optional cache** | Upstash Redis, with an in-memory fallback |
| **Tooling** | npm workspaces, ESLint, Node test runner, Docker, GitHub Actions |

## 4. Repository Structure

```
.
├── apps/
│   ├── web/              # React + Refine frontend (Vite)
│   └── api/              # Express + Drizzle REST API
│       ├── src/core/     # HTTP, auth, storage, database, jobs, shared plumbing
│       ├── src/modules/  # Feature modules (iam, documents, projects, design,
│       │                 #   workflow, workforce, finance, insights, platform)
│       ├── drizzle/      # SQL migrations and schema snapshots
│       └── scripts/      # ops/ (migrations, backups, verification) and demo/
├── packages/             # Shared role identifiers and TypeScript/ESLint config
├── infra/                # Dockerfiles and local PostgreSQL + MinIO Compose stack
├── docs/                 # Architecture, ADRs, setup guides, history
├── .github/workflows/    # ci.yml, cron.yml, backup.yml
└── scripts/dev.mjs       # Runs the web and API development servers together
```

API modules follow a consistent layering: **schema, repository, service, controller, routes**. The full tree and import rules are in [`docs/architecture/structure.md`](docs/architecture/structure.md).

## 5. Prerequisites

- Node.js 18 or later (tested on Node 22)
- npm 9 or later
- PostgreSQL 16 or later, local or hosted (the project targets Neon)
- Docker (optional, for the local PostgreSQL and MinIO stack)

## 6. Local Development Setup

### 6.1 Clone and install

```bash
git clone https://github.com/nhyl-beta/construction-system-easyconstruct.git
cd construction-system-easyconstruct
npm ci
```

### 6.2 Start local infrastructure (optional)

```bash
docker compose -f infra/compose/docker-compose.yml up -d
```

This starts PostgreSQL 16 and an S3-compatible MinIO service. Connection details are in [`infra/compose/README.md`](infra/compose/README.md).

### 6.3 Configure environment

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit both files; see [Environment Variables](#7-environment-variables).

### 6.4 Prepare the database

```bash
npm run db:migrate --workspace=@easyconstruct/api
ALLOW_DEMO_RESET=true npm run db:seed
```

The seed command creates demo accounts, one per role. Credentials are listed in [`docs/TEST_ACCOUNTS.md`](docs/TEST_ACCOUNTS.md) and are intended for local development only.

### 6.5 Run the application

```bash
npm run dev            # web and API together
npm run dev:client     # web only  (http://localhost:5173)
npm run dev:server     # API only  (http://localhost:8000)
```

## 7. Environment Variables

### 7.1 API (`apps/api/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. Use the direct (non-pooled) URL for migrations and backups. |
| `JWT_SECRET` | Yes in production | Long random string used to sign tokens. |
| `PORT` | No | API port. Defaults to `8000`. |
| `CORS_ORIGIN` | Yes | The single browser origin allowed to call the API, for example `https://easyconstruct.online`. |
| `APP_URL` | Yes | Public web URL used to build links in recovery and notification emails. |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_APP_PASSWORD`, `MAIL_FROM`, `MAIL_REQUIRE_TLS` | For email | SMTP settings (`MAIL_APP_PASSWORD` holds the Gmail App Password or the Brevo SMTP key). Without them, email endpoints return 503 rather than reporting a false success. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | For object storage | S3 storage is active only when **all** of endpoint, bucket, access key and secret are set. Otherwise uploads fall back to local disk, which is not persistent on most hosts. |
| `AWS_REQUEST_CHECKSUM_CALCULATION`, `AWS_RESPONSE_CHECKSUM_VALIDATION` | With Filebase | Set both to `WHEN_REQUIRED`. |
| `MAX_UPLOAD_MB` | No | Maximum upload size. Defaults to `100`. |
| `CRON_SECRET` | In production | Bearer token protecting `/api/cron/*`. Must match the GitHub Actions secret. |
| `TRUST_PROXY` | Behind a proxy | Set to `1` on Render. |
| `DISABLE_SCHEDULER` | No | Set to `true` when jobs are triggered externally by GitHub Actions. |
| `DB_POOL_MAX` | No | Database connection pool size. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | No | Optional shared cache. Leave unset to use the in-memory cache. |
| `FEATURE_AI` | No | Decision-support layer. Enabled unless set to exactly `false`. |

### 7.2 Web (`apps/web/.env`)

| Variable | Description |
| --- | --- |
| `VITE_API_BASE` | API origin only, for example `http://localhost:8000`. Do **not** add `/api`; the client appends it. |
| `VITE_API_URL` | API origin plus `/api`, used in hosted builds. |
| `VITE_FEATURE_AI` | Set to `false` together with the server flag to hide decision-support surfaces. |

Never commit `.env` files or secrets to the repository.

## 8. Available Scripts

### Repository root

| Script | Description |
| --- | --- |
| `npm run dev` | Runs the web and API development servers together. |
| `npm run dev:client` / `dev:server` | Runs one side only. |
| `npm run build:client` | Production build of the web app. |
| `npm run build:server` | Compiles the API to `apps/api/dist`. |
| `npm run db:seed` | Creates demo schema top-ups and demo accounts (guarded). |

### API workspace (`@easyconstruct/api`)

| Script | Description |
| --- | --- |
| `db:generate` | Generates Drizzle migrations from the schema. |
| `db:migrate` | Applies pending migrations. Supports `--dry-run` and `--baseline-through=<tag>`. |
| `db:verify-schema` | Compares the database against the expected schema. |
| `typecheck`, `lint` | Static checks. |
| `test`, `test:db` | Unit tests, and database-backed tests. |
| `demo:reset`, `demo:seed`, `demo:verify` | Demo data tools. They refuse to run in production and require explicit guards (`ALLOW_DEMO_RESET`, `DEMO_RESET_ALLOWED_HOSTS`). |

**Warning:** `db:reset` truncates every table, including user accounts. Use it only on a disposable local database.

## 9. Testing and Continuous Integration

```bash
npm test --workspace=@easyconstruct/api
npm test --workspace=@easyconstruct/web
npm run typecheck --workspace=@easyconstruct/web
npm run typecheck --workspace=@easyconstruct/api
```

The API test suite validates configuration on import, so `DATABASE_URL` and `JWT_SECRET` must be set (placeholder values are sufficient, for example `postgres://ci:ci@localhost:5432/ci_test` and `ci-test-secret`).

GitHub Actions workflows:

| Workflow | Purpose |
| --- | --- |
| `ci.yml` | Runs API and web tests, type checks, and compares API type errors against the recorded baseline in `refactor-notes/baseline.md`. |
| `cron.yml` | Calls the protected `/api/cron/*` endpoints on a schedule (and on manual dispatch). |
| `backup.yml` | Creates scheduled database backups and uploads them to object storage. |

Scheduled workflows run only from the repository's default branch.

## 10. Deployment

The production deployment uses free-tier services:

| Component | Service |
| --- | --- |
| Web application | Cloudflare Pages |
| API | Render (Docker web service) |
| Database | Neon PostgreSQL |
| File storage and backups | Filebase (S3-compatible, single bucket) |
| Transactional email | Brevo SMTP on port 2525 |
| Scheduled jobs and backups | GitHub Actions |
| Availability monitoring | UptimeRobot |
| Domain and DNS | Cloudflare |

Key points:

- Render's free tier sleeps after inactivity and blocks outbound SMTP on ports 25, 465 and 587; use port 2525.
- Run migrations against the **direct** Neon URL. Use the pooled URL only for the running API.
- `CORS_ORIGIN` accepts exactly one origin and must match the public web URL.
- The API does not run migrations on startup; apply them as a separate step.

The full procedure, environment matrix, backup, restore and rollback instructions are in [`docs/architecture/deployment.md`](docs/architecture/deployment.md).

## 11. Security Notes

- Secrets (`JWT_SECRET`, `CRON_SECRET`, storage keys, SMTP keys, database URLs) belong in the hosting provider's environment settings and GitHub Actions secrets, never in source control.
- Uploaded files are served through an authenticated route.
- Demo seed and reset scripts are guarded against production use.
- Review [`docs/architecture/SECURITY_CHECKLIST.md`](docs/architecture/SECURITY_CHECKLIST.md) before each release.

## 12. Documentation

| Document | Contents |
| --- | --- |
| [`docs/architecture/structure.md`](docs/architecture/structure.md) | Module layout and import rules |
| [`docs/architecture/deployment.md`](docs/architecture/deployment.md) | Hosting, environment matrix, backups, rollback |
| [`docs/architecture/PERFORMANCE.md`](docs/architecture/PERFORMANCE.md) | Performance notes |
| [`docs/adr/`](docs/adr) | Architecture decision records |
| [`docs/setup/`](docs/setup) | Server setup guide |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | UI design system |
| [`docs/PROCUREMENT_FLOW.md`](docs/PROCUREMENT_FLOW.md) | Procurement and reimbursement flow |
| [`docs/EASYCONSTRUCT_ROLE_INTERACTIONS.md`](docs/EASYCONSTRUCT_ROLE_INTERACTIONS.md) | How roles interact |
| [`CHANGES.md`](CHANGES.md) | Change history |

## 13. Project Information

- **Institution:** STI College San Jose del Monte
- **Program:** Bachelor of Science in Information Technology
- **Author:** Nhyl Cyrus J. Gervasio
- **Repository:** https://github.com/nhyl-beta/construction-system-easyconstruct

## 14. License

No license has been specified for this project. All rights are reserved by the author unless a license is added.
