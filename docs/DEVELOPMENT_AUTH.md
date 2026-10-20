# EasyConstruct Development Authentication

## Purpose

This document describes the minimum authentication flow used during EasyConstruct development and testing. It uses the existing Express authentication endpoint, PostgreSQL/Neon database, bcrypt password verification, and the existing role-based dashboard structure.

## Development Test Accounts

**Development/Test Accounts Only. Do not use these credentials in production.**

| Role | Email | Password | Backend role |
|---|---|---|---|
| Super Admin | `superadmin@easyconstruct.test` | `Test1234` | `super-admin` |
| Admin | `admin@easyconstruct.test` | `Test1234` | `admin` |
| Human Resources | `hr@easyconstruct.test` | `Test1234` | `human-resources` |
| Finance Manager | `finance@easyconstruct.test` | `Test1234` | `finance-manager` |
| Project Manager | `pm@easyconstruct.test` | `Test1234` | `project-manager` |
| Architect | `architect@easyconstruct.test` | `Test1234` | `architect` |
| Engineer | `engineer@easyconstruct.test` | `Test1234` | `engineer` |
| Site Personnel | `sitepersonnel@easyconstruct.test` | `Test1234` | `site-personnel` |
| Consultant | `consultant@easyconstruct.test` | `Test1234` | `consultant` |

## Starting the Application

From the repository root:

```bash
npm run db:seed
npm run dev
```

`npm run db:seed` runs the existing server seed script. `npm run dev` starts both the Vite client and Express server:

- Client: `http://localhost:5173`
- Server: `http://localhost:8000`

The client Vite configuration proxies `/api` requests to the server.

## Login Flow

```text
npm run dev
→ /
→ /login
→ LoginPage
→ LoginForm
→ POST /api/auth/login
→ users table lookup
→ bcrypt password verification
→ JWT and user role returned
→ sessionStorage/localStorage
→ /dashboard
```

The login response includes the authenticated user and the exact backend role. `client/src/config/role-mapping.ts` centrally maps backend kebab-case roles to the existing frontend role configuration keys.

## Expected Routes

- `/` — protected application entry; unauthenticated users are redirected to `/login`.
- `/login` — public login page.
- `/dashboard` — existing Project Manager dashboard route for the test account.
- `/projects`, `/workflows`, `/approvals`, and `/documents` — protected Project Manager application routes.
- `/forgot-password` and `/reset-password` — public auth routes already present in the project.

An authenticated user visiting `/login` is redirected to `/dashboard`. Logging out or clearing the EasyConstruct session keys causes protected routes to redirect to `/login`.

## Role Testing

All accounts use `/login` and the shared `/dashboard` route. Existing role-specific dashboard components are used for Project Manager, Human Resources, Finance Manager, and Architect. Engineer, Site Personnel, Consultant, Admin, and Super Admin use the existing dashboard fallback and their role-specific navigation configuration.

| Role | Backend role | Frontend role | Destination |
|---|---|---|---|
| Super Admin | `super-admin` | `super_admin` | `/dashboard` |
| Admin | `admin` | `admin` | `/dashboard` |
| Human Resources | `human-resources` | `human_resources` | `/dashboard` |
| Finance Manager | `finance-manager` | `finance_manager` | `/dashboard` |
| Project Manager | `project-manager` | `project_manager` | `/dashboard` |
| Architect | `architect` | `architect` | `/dashboard` |
| Engineer | `engineer` | `engineer` | `/dashboard` |
| Site Personnel | `site-personnel` | `site_personnel` | `/dashboard` |
| Consultant | `consultant` | `consultant` | `/dashboard` |

## Database Accounts

The development account is inserted by `server/src/db/seed.ts`, which is the existing project seed mechanism:

```bash
npm run db:seed
```

The seed hashes `Test1234` with bcrypt before inserting all nine records into `server/src/db/schema/users.ts`. The stored passwords are never plaintext. Each email is a unique conflict target, so repeated runs update the same development record without duplicates.

## Authentication Storage

The login controller stores:

- `easyconstruct_token`
- `easyconstruct_user`

in `sessionStorage` by default. If the user selects “Keep me signed in on this device”, the same keys are stored in `localStorage`. The auth provider reads the stored session at startup, protects application routes, and clears both storage locations on logout.

## Testing Checklist

- [x] Application startup commands are defined.
- [x] `/` redirects to `/login` when unauthenticated through the protected route wrapper.
- [x] Login page route is public and renders outside the application layout.
- [x] Test account is seeded into the existing database table.
- [x] Password is bcrypt-hashed before insertion.
- [x] Backend returns the `project-manager` role.
- [x] Seed defines all nine development accounts with canonical backend roles.
- [x] Seed is repeatable without duplicate users.
- [x] Backend login was verified for all nine accounts.
- [x] Backend role-to-frontend role mapping is centralized.
- [x] Authenticated users are redirected to `/dashboard`.
- [x] Invalid credentials are handled by the existing backend and login form.
- [x] Protected routes redirect unauthenticated users.
- [x] Existing session storage is restored on frontend startup.
- [ ] Frontend build succeeds; unrelated pre-existing TypeScript errors remain in `ProjectCreatePage.tsx`.
- [ ] Backend build succeeds; unrelated pre-existing TypeScript errors and missing modules remain elsewhere in the server.

## Known Limitations

- The backend JWT is stored and checked for frontend session presence, but the server’s other application routes do not yet include JWT verification middleware.
- The existing frontend role configuration uses `project_manager` internally while the backend/database contract uses the required `project-manager` identifier; the auth layer performs this compatibility mapping without changing the backend role.
- Some roles do not yet have dedicated dashboard components, so they use the existing shared dashboard fallback.
- Forgot-password and reset-password endpoints are referenced by existing UI controllers but are not implemented by the current backend route set.
- Full browser automation was not available in the environment, so direct route serving, startup, seed execution, and backend authentication were verified without an automated browser click-through.
