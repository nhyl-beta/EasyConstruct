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

## Phase 4: Guardrails and clean-up
- Status: partial
- Date: 2026-10-20
- Head after phase: thesis-final @ dc8cdef, pushed: no
- Commits:
  - dc8cdef phase 4: move API scripts and add repository guardrails
  - Log entry commit follows this implementation commit.

### What moved
| From | To |
| --- | --- |
| `apps/api/src/scripts/` (72 files) | `apps/api/scripts/ops/` and `apps/api/scripts/demo/` |
| `apps/api/src/modules/platform/audit-logs/repository.ts` | `apps/api/src/core/audit/repository.ts` |
| API session lookup, project-visibility roles, and audit types | `apps/api/src/core/auth/`, `core/access/`, and `core/audit/` |
| `apps/web/Dockerfile` | `infra/docker/web.Dockerfile` |
| Selected progress and thesis notes | `docs/history/` |
| Security and performance documents | `docs/architecture/` |
| New-server setup guide | `docs/setup/` |
| — | `infra/compose/`, `infra/docker/api.Dockerfile`, architecture guide, ADR, CI workflow, and canonical shared role IDs |

### Checks
| Check | Baseline | Now | Command |
| --- | --- | --- | --- |
| API tests passed / failed | 931 / 0 | 932 / 0 | `npm --prefix apps/api test` |
| Web tests passed / failed | 333 / 0 | 333 / 0 | `npm --prefix apps/web test` |
| API build | pass | pass | `npm --prefix apps/api run build` |
| Web build | pass | pass | `npm --prefix apps/web run build` |
| API type errors | 0 | 0 | `npm --prefix apps/api run typecheck` |
| API route list | 263 routes | 263 routes; identical / 0 lines differ | `apps/api/node_modules/.bin/tsx.cmd apps/api/scripts/ops/list-routes.ts` with placeholder `DATABASE_URL` |
| API lint | not run | pass; 0 errors, 63 warnings | `npm --prefix apps/api run lint` |
| Web lint | not run | pass; 0 errors, 36 warnings | `npm --prefix apps/web run lint` |
| Web typecheck | not run | pass | `npm --prefix apps/web run typecheck` |
| API script targets | not run | 34 targets; 0 missing | package-script target scan |
| Moved API script relative imports | not run | 0 unresolved | relative-import resolution scan |
| Compose configuration | not run | pass | `docker compose -f infra/compose/docker-compose.yml config -q` |
| Root workspace install | blocked in Phase 1 | not run; same exFAT junction limitation | `npm ci` |
| GitHub Actions CI | not run | not run; commits intentionally remain local | GitHub Actions |

### Route list differences
(none)

### Deviations from the prompt
- Commits remain local and no push was attempted, per Nhyl's instruction. Consequently the remote CI workflow could not run.
- The first web test run timed out under concurrent test/build load (332 passed, 1 timed out); rerunning the suite without concurrent builds passed 333/333.
- `npm ci` was not repeated at the root because Phase 1 established that this D: exFAT volume cannot create npm workspace junctions. App-local installs and checks were used; CI is configured to install on Linux.
- Kept the fixed `/api` rewrite target in `apps/web/vercel.json`; no branch-safe runtime configuration was identified, and no Vercel project settings were changed.
- Removed the `finance_manager` alias from the finance payroll-review `requireRole` call because it is the underscore spelling of the canonical `finance-manager` role already accepted by that check.
- Removed unused declarations/imports and replaced one `any` query parameter type in the web app to make the newly added lint/build checks pass; these are type/lint-only cleanups.
- Removing the old `docs/` ignore rule revealed pre-existing untracked root documents. They were left unmodified and unstaged; only the requested tracked documentation moves and new architecture documents were committed.
- Existing historical path references in `docs/architecture/PERFORMANCE_AUDIT.md` remain as an audit of the earlier staging snapshot.

### Needs Nhyl's decision
- None. Push and review of the local branch remain manual.

### Unresolved errors
None. The remote CI run and root `npm ci` were not run for the reasons recorded above.

### Next step
- Phase 5: append the final report and manual hand-back steps; commit locally, then stop.

## Phase 5: Report and hand back
- Status: done
- Date: 2026-10-20
- Head after phase: thesis-final @ 5846fe1, pushed: no
- Commits:
  - 5846fe1 phase 5: finalize restructuring report

### What moved
The final structure is documented in `docs/architecture/structure.md`. API feature files moved in Phase 3:

| Module | Files moved |
| --- | ---: |
| `design` | 65 |
| `documents` | 33 |
| `finance` | 87 |
| `iam` | 20 |
| `insights` | 53 |
| `platform` | 26 |
| `projects` | 111 |
| `workflow` | 7 |
| `workforce` | 54 |
| **Total** | **456** |

### Checks
| Check | Before refactor | Final local result | Command |
| --- | --- | --- | --- |
| API tests passed / failed | 931 / 0 | 932 / 0 | `npm --prefix apps/api test` |
| Web tests passed / failed | 333 / 0 | 333 / 0 | `npm --prefix apps/web test` |
| API build | pass | pass | `npm --prefix apps/api run build` |
| Web build | pass | pass | `npm --prefix apps/web run build` |
| API type errors | 0 | 0 | `npm --prefix apps/api run typecheck` |
| API routes | 263 | 263; identical / 0 lines differ | `apps/api/scripts/ops/list-routes.ts` with placeholder `DATABASE_URL` |
| Web route values | 77 | 77; identical / 0 lines differ | Extract `path` values from `apps/web/src/App.tsx` and compare with `web-routes-before.txt` |
| API / web lint | not run | pass / pass; 63 / 36 warnings, 0 errors | `npm --prefix apps/api run lint`; `npm --prefix apps/web run lint` |
| API import and script paths | not run | boundaries pass; 34 package script targets and moved relative imports resolve | API ESLint and local path scans |
| Schema and migrations | unchanged | unchanged; Drizzle snapshot comparison not verified | `git diff --name-only -- apps/api/drizzle` |
| Remote CI | not run | not run; branch intentionally remains local | GitHub Actions |

### Route list differences
(none for API or web)

### Deviations from the prompt
- All work is committed locally on `thesis-final`; no commits were pushed, per Nhyl's instruction.
- CI and the root `npm ci` remain unverified remotely/locally for the recorded reasons: no push, and the local exFAT volume cannot create npm workspace junctions.
- The existing API smoke test was not run against a demo database. A local demo database was not verified as available, and the script now lives at `apps/api/scripts/demo/api-smoke-test.ts` with the production guard.
- No schema or migration files were changed. The Drizzle schema-generation comparison remains the Phase 2 unverified item.

### Needs Nhyl's decision
- None. When ready, Nhyl can push `thesis-final` and review the resulting GitHub Actions run.

### Unresolved errors
None in the final local checks. Remote CI, root `npm ci`, and Drizzle snapshot comparison were not run as documented.

### Next step
- Manually push `thesis-final` with `git push -u origin thesis-final`, then review the GitHub Actions workflow. No branch, Vercel, Neon, or GitHub settings were changed.
