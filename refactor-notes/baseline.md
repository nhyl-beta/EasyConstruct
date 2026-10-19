# Phase 0 baseline

- Branch: `thesis-final`
- `origin/staging` merge base: `4c99f36`
- Starting HEAD: `4c99f36`
- Server install: `npm ci --prefix server` passed; 272 packages added.
- Client install: `npm ci --prefix client` passed; 942 packages added.
- npm audit output: server reported 8 vulnerabilities (7 moderate, 1 critical); client reported 47 (14 moderate, 29 high, 4 critical).
- API tests: 931 passed, 0 failed (`npm test --prefix server`).
- Web tests: 333 passed, 0 failed (`npm test --prefix client`).
- API build: passed (`npm run build --prefix server`).
- Web build: passed (`npm run build --prefix client`); Vite reported the existing JavaScript bundle exceeds 500 kB.
- API type errors: 0 `error TS` lines (`server/node_modules/.bin/tsc.cmd --noEmit -p server`, equivalent to `npx tsc --noEmit -p server`).
- API routes: 263 distinct method/path entries in `routes-before.txt`; runtime router-stack traversal with TypeScript source mount-prefix association. The inventory includes `GET /api/projects` and `POST /api/auth/login`.
- Web routes: 77 `path` attribute values from `client/src/App.tsx`, in source order.
- `server/src/services/api.client.ts`: no imports or references found under `server/src`. A README match refers to the separate web client `client/src/services/api.client.ts`.

The API route listing imports the Express app without listening. A temporary placeholder `DATABASE_URL` was supplied because importing the app validates configuration; route enumeration made no database connection.
