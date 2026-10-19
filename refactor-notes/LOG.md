# Refactor log: EasyConstruct enterprise structure
Branch: thesis-final (from origin/staging at 4c99f36)
Prompt: claude/enterprise-structure-refactor-prompt.md
Agent: GitHub Copilot

## Phase 0: Baseline
- Status: partial
- Date: 2026-10-19
- Head after phase: thesis-final @ 367b03c, pushed: no
- Commits:
  - ce6188e phase 0: capture baseline results and routes
  - 367b03c phase 0: record baseline completion in log

### What moved
| From | To |
| --- | --- |
| — | `server/scripts/ops/list-routes.ts` |
| — | `refactor-notes/baseline.md` |
| — | `refactor-notes/routes-before.txt` |
| — | `refactor-notes/web-routes-before.txt` |

### Checks
| Check | Baseline | Now | Command |
| --- | --- | --- | --- |
| API tests passed / failed | — | 931 / 0 | `npm test --prefix server` |
| Web tests passed / failed | — | 333 / 0 | `npm test --prefix client` |
| API build | — | pass | `npm run build --prefix server` |
| Web build | — | pass | `npm run build --prefix client` |
| API type errors | — | 0 | `server/node_modules/.bin/tsc.cmd --noEmit -p server` |
| API route list | — | 263 routes; expected routes present | `server/node_modules/.bin/tsx.cmd server/scripts/ops/list-routes.ts` |
| Web route list | — | 77 path values | Extracted `path` attributes from `client/src/App.tsx` |

### Route list differences
(none)

### Deviations from the prompt
- The Express 5 router stack was walked at runtime; TypeScript source AST was used to associate mounted routers with their source prefixes because the runtime layer stack does not retain those prefixes.
- The route-list command received a temporary placeholder `DATABASE_URL` because importing the app validates environment configuration. The script did not listen or connect to a database.
- Push failed because the non-interactive environment could not prompt for GitHub credentials; the branch and commit remain local. A log-only correction commit records the push failure; its own hash cannot be embedded in its commit content.

### Needs Nhyl's decision
- Nhyl chose to leave the commits local. Publish them to `thesis-final` before Phase 1, then say "continue".

### Unresolved errors
None.

### Next step
- Push the phase 0 commits on `thesis-final`; then wait for Nhyl to say "continue" before Phase 1.

## Phase 1: Workspace skeleton
- Status: partial
- Date: 2026-10-20
- Head after phase: thesis-final @ f8bc6e1, pushed: no
- Commits:
  - f8bc6e1 phase 1: move apps into workspace skeleton

### What moved
| From | To |
| --- | --- |
| `client/` (628 tracked paths) | `apps/web/` |
| `server/` (710 tracked paths) | `apps/api/` |
| — | `packages/shared/` (`@easyconstruct/shared`, empty `index.ts`) |
| — | `packages/config/` (base TypeScript config and shared ESLint config) |
| — | Root npm workspace manifest and lockfile |

### Checks
| Check | Baseline | Now | Command |
| --- | --- | --- | --- |
| API tests passed / failed | 931 / 0 | 931 / 0 | `npm test --prefix apps/api --workspaces=false` |
| Web tests passed / failed | 333 / 0 | 333 / 0 | `npm test --prefix apps/web --workspaces=false` |
| API build | pass | pass | `npm run build:server` |
| Web build | pass | pass | `npm run build:client` |
| API type errors | 0 | 0 | `apps/api/node_modules/.bin/tsc.cmd --noEmit -p apps/api` |
| API route list | 263 routes | identical / 0 lines differ | `apps/api/node_modules/.bin/tsx.cmd apps/api/scripts/ops/list-routes.ts` |
| Root workspace install | — | fail (D: is exFAT; npm workspace directory junction unsupported) | `npm ci --offline --no-audit --no-fund` |
| App dependency installs | — | pass (272 API, 942 web packages) | `npm ci --workspaces=false --offline --no-audit --no-fund --prefix apps/api` and corresponding `apps/web` command |
| Shared ESLint config | — | pass | `eslint src/config/pagination-exempt.test.ts` from `apps/web/` |
| Workspace manifests/root-lock links | — | pass | Node verification script |

### Route list differences
(none)

### Deviations from the prompt
- Root `npm ci` was attempted but cannot create npm workspace junctions on this D: exFAT volume (`EISDIR`). App dependencies were installed separately with workspaces disabled, allowing tests and builds to run. The root workspace lockfile and workspace links were checked structurally; do not treat the failed local root install as a successful `npm ci`.
- API and web package names were scoped (`@easyconstruct/api` and `@easyconstruct/web`) so npm creates non-generic workspace links and root scripts can address each workspace unambiguously.
- The refactor prompt's conditional warning about Vercel preview builds applies: no Vercel configuration or project settings were changed, and preview behavior was not run or verified.
- Path references in active scripts and the root README were updated. Ignored historical `docs/` content is left for Phase 4, when the docs ignore rule is removed; one user-visible AI reference description retains its old source-path text to avoid changing UI copy in this move-only phase.
- Changes and commits remain local as Nhyl requested; no push was attempted.
- This phase entry is written after the implementation commit. Its recorded head is that implementation commit; the following log-only commit adds this entry.

### Needs Nhyl's decision
- None. Nhyl will publish the local commits from `thesis-final`.

### Unresolved errors
Root workspace installation is blocked by the filesystem's lack of directory-junction support:
```text
npm error code EISDIR
npm error syscall symlink
npm error path ...\apps\web
npm error dest ...\node_modules\@easyconstruct\web
npm error errno -4068
npm error EISDIR: illegal operation on a directory, symlink
```

### Next step
- Phase 2: API core, after Nhyl pushes the local Phase 0 and Phase 1 commits and says "continue".

## Phase 2: API core
- Status: partial
- Date: 2026-10-20
- Head after phase: thesis-final @ fcc76ae, pushed: no
- Commits:
  - fcc76ae phase 2: move API plumbing into core

### What moved
| From | To |
| --- | --- |
| `apps/api/src/config/`, `constants/` | `apps/api/src/core/config/` |
| `apps/api/src/middleware/` | `apps/api/src/core/http/` |
| `apps/api/src/db/` including schema | `apps/api/src/core/db/` including schema |
| `apps/api/src/cache/`, `mail/` | `apps/api/src/core/cache/`, `core/mail/` |
| `apps/api/src/utils/`, `types/` | `apps/api/src/core/utils/` |
| `apps/api/src/utils/audit.ts` | `apps/api/src/core/audit/audit.ts` |
| auth middleware, session and throttle helpers | `apps/api/src/core/auth/` |
| `apps/api/src/jobs/lock.ts`, `scheduler.ts` | `apps/api/src/core/jobs/` |
| Vercel Blob and local-disk upload handling | `apps/api/src/core/storage/` adapters; upload service delegates to the selected adapter |
| `apps/api/src/index.ts` | `apps/api/src/main.ts`; added thin `src/vercel.ts` and root handler re-export |

### Checks
| Check | Baseline | Now | Command |
| --- | --- | --- | --- |
| API tests passed / failed | 931 / 0 | 931 / 0 | `npm test` from `apps/api/` |
| Web tests passed / failed | 333 / 0 | not run (API-only phase) | not run |
| API build | pass | pass | `npm run build` from `apps/api/` |
| Web build | pass | not run (API-only phase) | not run |
| API type errors | 0 | 0 | `apps/api/node_modules/.bin/tsc.cmd --noEmit -p apps/api` |
| API route list | 263 routes | identical / 0 lines differ | `apps/api/node_modules/.bin/tsx.cmd apps/api/scripts/ops/list-routes.ts` |
| Unauthenticated projects route | 401 | 401 | `GET http://localhost:8000/api/projects` while `npm run dev` was running |
| Production JWT validation | no requirement | missing secret rejected | Isolated `node --import tsx` check with `NODE_ENV=production` |
| Drizzle schema generation | — | not verified | `drizzle-kit generate` has no `--dry-run`; scratch-output invocation stopped on a non-TTY interactive snapshot/schema conflict |

### Route list differences
(none)

### Deviations from the prompt
- The filesystem's exFAT workspace-link limitation from Phase 1 remains. App-local dependency installations were used for API checks.
- Drizzle schema generation could not be confirmed. The installed Drizzle CLI has no `--dry-run`; a disposable output attempt required an interactive prompt when comparing the existing snapshots. No migration or schema file was edited or retained.
- Starting `npm run dev` for the required request smoke check also started the configured scheduled jobs. Their logs reported attendance exceptions flagged, signal scan results, and overdue reminders/reports; no rollback was attempted. This was normal startup behavior in the existing entrypoint.
- Changes and commits remain local for Nhyl to push manually.

### Needs Nhyl's decision
- None.

### Unresolved errors
Drizzle's disposable-output comparison could not run non-interactively:
```text
Error: Interactive prompts require a TTY terminal (process.stdin.isTTY or process.stdout.isTTY is false).
```

### Next step
- Phase 3: move API features into modules and add the module registry while preserving mount order and routes.

## Phase 3: API modules
- Status: done
- Date: 2026-10-20
- Head after phase: thesis-final @ 439b6b4, pushed: no
- Commits:
  - 439b6b4 phase 3: move API features into modules

### What moved
| From | To |
| --- | --- |
| API feature folders and their tests | `apps/api/src/modules/design/` (65 files) |
| API feature folders and their tests | `apps/api/src/modules/documents/` (33 files) |
| API feature folders and their tests | `apps/api/src/modules/finance/` (87 files) |
| API feature folders and their tests | `apps/api/src/modules/iam/` (20 files) |
| API feature folders and their tests | `apps/api/src/modules/insights/` (53 files) |
| API feature folders and their tests | `apps/api/src/modules/platform/` (26 files) |
| API feature folders and their tests | `apps/api/src/modules/projects/` (111 files) |
| API feature folders and their tests | `apps/api/src/modules/workflow/` (7 files) |
| API feature folders and their tests | `apps/api/src/modules/workforce/` (54 files) |
| Validators | Beside their corresponding module sub-features; auth routes moved to `modules/iam/auth/routes.ts` |
| `reference/document-types/` | `modules/documents/document-types/`; platform reference routes consume it via the documents module index |
| API mounts | `modules/*/module.ts` manifests and `modules/index.ts`; `app.ts` mounts the registry in preserved order |

### Checks
| Check | Baseline | Now | Command |
| --- | --- | --- | --- |
| API tests passed / failed | 931 / 0 | 931 / 0 | `npm test` from `apps/api/` |
| Web tests passed / failed | 333 / 0 | not run (API-only phase) | not run |
| API build | pass | pass | `npm run build` from `apps/api/` |
| Web build | pass | not run (API-only phase) | not run |
| API type errors | 0 | 0 | `apps/api/node_modules/.bin/tsc.cmd --noEmit -p apps/api` |
| API route list | 263 routes | identical / 0 lines differ | `apps/api/node_modules/.bin/tsx.cmd apps/api/scripts/ops/list-routes.ts` |
| Finance module flag | — | 3 finance routes removed; 0 unexpected differences | Route inventory with `MODULE_FINANCE=false` |
| AI compatibility flag | — | 0 insights routes remain | Route inventory with `FEATURE_AI=false` |
| Module import boundaries | — | 0 cross-module deep imports | TypeScript import scan of `apps/api/src/modules/` |

### Route list differences
(none)

### Deviations from the prompt
- Mounts carry an explicit order number because the existing mount sequence interleaves features from different modules. Sorting the registry mounts by this order reproduced the exact route inventory.
- The runtime route-list script now traverses module manifests rather than assuming `app.ts` contains literal `app.use` calls.
- One full API suite attempt had a transient timeout in the Upstash round-trip test; that test passed when rerun alone, and the subsequent full suite passed 931/931.
- Commits remain local for Nhyl to push manually.

### Needs Nhyl's decision
- `employee-validator.ts` and `employee-validators.ts` remain separate as `modules/workforce/employees/validators.ts` and `employee-validators.ts`; no merge was attempted.
- `validators/tickets.test.ts` spans auth, projects, workflow, requirements, and workforce parsing. It was placed in `modules/iam/auth/tickets.test.ts` as a cross-feature test, with module imports routed through public indexes.

### Unresolved errors
None.

### Next step
- Phase 4: add import-boundary guardrails, relocate operational/demo scripts, clean up, add shared roles, CI, infrastructure, and documentation.
