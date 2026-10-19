# Refactor log: EasyConstruct enterprise structure
Branch: thesis-final (from origin/staging at 4c99f36)
Prompt: claude/enterprise-structure-refactor-prompt.md
Agent: GitHub Copilot

## Phase 0: Baseline
- Status: done
- Date: 2026-10-19
- Head after phase: thesis-final @ ce6188e, pushed: yes
- Commits:
  - ce6188e phase 0: capture baseline results and routes

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
- This entry records the baseline artifact commit. A separate log-only commit completes this phase entry; its own hash cannot be embedded in its commit content.

### Needs Nhyl's decision
- None.

### Unresolved errors
None.

### Next step
- Phase 1: Workspace skeleton.
