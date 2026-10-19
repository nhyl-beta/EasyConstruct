# EasyConstruct repository structure

```text
.
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── main.ts                 # HTTP listener and scheduled jobs
│   │   │   ├── vercel.ts               # serverless app export
│   │   │   ├── app.ts                  # middleware and module registry
│   │   │   ├── core/
│   │   │   │   ├── config/ http/ auth/ access/ audit/
│   │   │   │   ├── storage/ db/ cache/ mail/ jobs/ utils/
│   │   │   └── modules/
│   │   │       ├── index.ts            # ordered, flag-aware module registry
│   │   │       └── <module>/
│   │   │           ├── module.ts       # mounts and owned tables
│   │   │           ├── index.ts        # public exports for other modules
│   │   │           └── <feature>/      # routes, controllers, services, tests
│   │   ├── drizzle/                    # unchanged SQL migrations/snapshots
│   │   └── scripts/{ops,demo}/
│   └── web/
├── packages/
│   ├── shared/                         # shared role ids and API contracts
│   └── config/                         # base TypeScript and ESLint config
├── infra/{compose,docker}/
├── docs/{architecture,adr,history,setup}/
└── .github/workflows/ci.yml
```

## API module map

| Module | Owns |
| --- | --- |
| `iam` | Authentication, users, roles, user settings |
| `documents` | Documents, uploads, document types |
| `projects` | Projects, members, stakeholders, milestones, tasks, issues, lifecycle, revisions, requirements, reports, calendar, dashboard |
| `design` | Designs/reviews/revisions, requests, transmittals, deliverables, proposals, blueprints, architect documents |
| `workflow` | Workflows and approvals |
| `workforce` | Employees, HR, attendance, payroll, workforce reports |
| `finance` | Finance sub-features and payroll review |
| `insights` | AI validation, signals, forecasts, plan suggestions, decision support, reconciliation |
| `platform` | Notifications, audit-log routes, reference clients/vendors, scheduled-job routes |

## Import and mount rules

- `app.ts` applies global middleware in the existing order, mounts enabled module manifests in their explicit order, then installs error middleware.
- A module may import shared/core code and its own feature files. Cross-module imports must target only the other module's `index.ts`; add an export there rather than importing a peer's implementation file.
- Core code is framework/platform plumbing and must not import modules. Feature dependencies are passed into core jobs/auth/audit facilities where required.
- Module manifests list route prefixes, router middleware and owned database tables. Flags are default-on; IAM, documents and platform are always on. `FEATURE_AI=false` remains an alias for disabling insights.
- Keep database schema in `apps/api/src/core/db/schema/` and migrations/snapshots in `apps/api/drizzle/`. A folder move is not permission to alter tables or migrations.
- `src/main.ts` listens and starts scheduled work; `src/vercel.ts` exports the Express app without listening.
