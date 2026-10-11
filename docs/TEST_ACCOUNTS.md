# EasyConstruct Development Test Accounts

> These credentials are for local development/testing only. Never use them as production credentials.

All accounts share the password **`Demo@12345`**, hashed with bcrypt by the seed script (`server/src/scripts/seed-demo-accounts.ts`) — nothing is stored in plaintext.

## Named accounts

One hand-named account per role, seeded first.

| Role | Name | Email | Backend role |
|---|---|---|---|
| Admin | Dana Reyes | `admin@easyconstruct.demo` | `admin` |
| Project Manager | Miguel Santos | `pm@easyconstruct.demo` | `project-manager` |
| Human Resources | Liza Torres | `hr@easyconstruct.demo` | `human-resources` |
| Finance Manager | Carlo Ramos | `finance@easyconstruct.demo` | `finance-manager` |
| Architect | Ana Villanueva | `architect@easyconstruct.demo` | `architect` |
| Engineer | Paolo Mendoza | `engineer@easyconstruct.demo` | `engineer` |
| Site Personnel | Rico Domingo | `site@easyconstruct.demo` | `site-personnel` |
| Consultant | Elena Bautista | `consultant@easyconstruct.demo` | `consultant` |
| Owner | Teresa Aquino | `nhylcyrusgervasio@gmail.com` | `owner` |
| IT Designer | Noel Garcia | `itdesigner@easyconstruct.demo` | `it-designer` |

> The legacy "Super Admin" role and its `superadmin@easyconstruct.*` accounts no longer exist — that role was renamed/merged into **IT Designer** (`it-designer`). Any old token or seed data referencing `super-admin` is migrated forward automatically (see `server/src/scripts/ensure-demo-schema.ts`).

## Generated accounts (4 per role)

Numbered accounts for exercising a role with multiple concurrent users, named `<Role Label> <One|Two|Three|Four>`, email pattern `<role-slug-without-hyphens><n>@easyconstruct.demo`.

| Role | Backend role | Emails |
|---|---|---|
| Admin | `admin` | `admin1@easyconstruct.demo` … `admin4@easyconstruct.demo` |
| IT Designer | `it-designer` | `itdesigner1@easyconstruct.demo` … `itdesigner4@easyconstruct.demo` |
| Owner | `owner` | `owner1@easyconstruct.demo` … `owner4@easyconstruct.demo` |
| Project Manager | `project-manager` | `projectmanager1@easyconstruct.demo` … `projectmanager4@easyconstruct.demo` |
| Architect | `architect` | `architect1@easyconstruct.demo` … `architect4@easyconstruct.demo` |
| Engineer | `engineer` | `engineer1@easyconstruct.demo` … `engineer4@easyconstruct.demo` |
| Consultant | `consultant` | `consultant1@easyconstruct.demo` … `consultant4@easyconstruct.demo` |
| Finance Manager | `finance-manager` | `financemanager1@easyconstruct.demo` … `financemanager4@easyconstruct.demo` |
| Human Resources | `human-resources` | `humanresources1@easyconstruct.demo` … `humanresources4@easyconstruct.demo` |
| Site Personnel | `site-personnel` | `sitepersonnel1@easyconstruct.demo` … `sitepersonnel4@easyconstruct.demo` |

That's **50 accounts total** (10 named + 40 generated) across all 10 roles the app defines.

## How to seed

```bash
npm run db:seed
```

Runs `server/src/scripts/ensure-demo-schema.ts` (compatibility tables/columns) then `server/src/scripts/seed-demo-accounts.ts` (accounts, roles, workflow templates). Idempotent — an account that already exists by email is skipped, not duplicated.

### Full reset + reseed

```bash
npm run db:reset
```

Applies pending migrations, **truncates every table** in the database (irreversible — demo/dev only, refuses to run with `NODE_ENV=production`), then reseeds from scratch via `db:seed`.

## How to start

```bash
npm run dev
```

## Login

Open `/login` and enter any account above. The backend determines the role from the database user record; the login form does not accept or submit a role.

## Role mapping and dashboards

Every backend role now has its own dashboard — there is no fallback "coming soon" screen left (`client/src/pages/dashboard/index.tsx`).

| Backend role | Frontend role key | Dashboard |
|---|---|---|
| `admin` | `admin` | Admin dashboard |
| `owner` | `owner` | Owner executive dashboard |
| `it-designer` | `it_designer` | IT Designer system dashboard |
| `human-resources` | `human_resources` | HR dashboard |
| `finance-manager` | `finance_manager` | Finance dashboard |
| `project-manager` | `project_manager` | Project Manager dashboard |
| `architect` | `architect` | Architect dashboard |
| `engineer` | `engineer` | Engineer dashboard |
| `site-personnel` | `site_personnel` | Site Personnel dashboard |
| `consultant` | `consultant` | Consultant dashboard |

## Expected behavior

Every account goes through the same login page, `/api/auth/login` endpoint, database lookup, bcrypt verification, JWT response, and browser session storage. Clearing the session redirects protected routes back to `/login`.

## Important

These accounts are strictly for development/testing and must never be used as production credentials.
