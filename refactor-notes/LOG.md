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
