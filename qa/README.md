# EasyConstruct QA suite

Automated checks that replace most of the manual test round. Results are written as CSV in the columns of the
"IT Designer Module" test sheet. Everything lives under `qa/`; the app is never modified.

## Safety rules (read first)

* The suite reads **only** `QA_DATABASE_URL`, `QA_BASE_URL` and `QA_API_URL`. It never uses `DATABASE_URL` or the app's `.env`.
* `qa/src/guard.ts` is called first by every entry point (reset, Playwright config, `qa:guard`). It exits with code 1 if:
  * `QA_DATABASE_URL` is missing, malformed, or on the production Neon host `ep-fancy-king-aofmiicn`;
  * `QA_DATABASE_URL` is the same database as `DATABASE_URL` in the shell or any `.env*` file (remote: same host; local: same host+port+name);
  * `QA_BASE_URL` or `QA_API_URL` contains `easyconstruct.online`.
* `qa:reset` **drops and rebuilds** the database in `QA_DATABASE_URL`. It additionally requires a local host, or a database name containing `qa` or `test`.
* The API under test must be started against the QA database: `npm run serve --prefix qa` does this with a clean environment (no mail, no Blob/S3, scheduler off). Never point `QA_API_URL` at an API started with the normal `.env`.

## Setup

Put `QA_DATABASE_URL=...` (and optionally `QA_BASE_URL`, `QA_API_URL`) in `qa/.env.qa`. It is git-ignored and only `QA_*` keys are read; a real environment variable overrides the file.

```bash
npm ci --workspace=@easyconstruct/api          # API dependencies, once
npm install --prefix qa                        # QA dependencies
export QA_DATABASE_URL=postgres://qa:qa@localhost:5432/easyconstruct_qa   # a throwaway database
# optional (defaults shown)
export QA_BASE_URL=http://localhost:5173
export QA_API_URL=http://localhost:8123/api
```

## Commands (run from the repo root)

Every command goes through `qa/src/guard.ts` first. `src/run.ts` starts the QA API (and the web app, for browser suites) if they are not
already running, using a clean environment, and stops what it started.

| Command | What it does | Typical time (4 cores) |
|---|---|---|
| `npm run qa:guard` | Validates the QA environment and prints the targets. | < 1 s |
| `npm run qa:reset` | Rebuilds the QA database: schema, accounts, employees, document types, `DEMO-STAGE-0..6`. | ~6 min |
| `npm run qa:smoke` | Sign-in and dashboard per role, 10 key pages, access-matrix API sample. | < 3 min |
| `npm run qa:api` | API permission suite from `01_access_matrix.csv` (530 role-by-page cells). | ~1 min |
| `npm run qa:ui:access` | UI role checks: NAVIGATE, CONTENT, DENIED, READ-ONLY (547 checks). | ~22 min |
| `npm run qa:functional` | SEARCH / FILTER, PAGINATION, FORM VALIDATION (214 checks). | ~9 min |
| `npm run qa:lifecycle` | Lifecycle cases from `02` through the API, plus the UI-driven runs (LC-001, 100, 120, 150). | ~3 min |
| `npm run qa:crawl` | Click-everything crawler per role; fails on console errors, failed requests, blank screens. | ~12 min |
| `npm run qa:full` | Every project above except the write probes, one run, one set of CSVs and the HTML report. | ~45 min |
| `npm run qa:findings` | Builds `qa/results/findings.md` from the latest run. | seconds |

Do not pass `--reporter=...` to Playwright: it replaces the configured reporters and the CSV reporter would not run.

Guard unit test: `npm run test:guard --prefix qa`.

## Test accounts (test-only values, QA database only)

Password for every account: `Demo@12345`.

| Role | Email |
|---|---|
| Owner | `qa-owner@easyconstruct.demo` (set at seed time, so the real owner mailbox is never used) |
| Admin | `admin@easyconstruct.demo` |
| IT Designer | `itdesigner@easyconstruct.demo` |
| Project Manager | `pm@easyconstruct.demo` |
| Human Resources | `hr@easyconstruct.demo` |
| Finance Manager | `finance@easyconstruct.demo` |
| Architect | `architect@easyconstruct.demo` |
| Engineer | `engineer@easyconstruct.demo` |
| Site Personnel | `site@easyconstruct.demo` |
| Consultant | `consultant@easyconstruct.demo` |

## Reading the results

`qa/results/<timestamp>/` (git-ignored) holds `02_lifecycle_test_cases.csv`, `03_role_page_checks.csv`, `manual-queue.csv`
and `summary.csv`. Columns: `Test Case ID, Objective, Precondition, Test Data, Steps, Test Procedure, Expected Results,
Actual Results, Status, Remarks, Executed by, Executed Date`, then `Automation, Role`. Import into the matching sheet tab.
Status is Passed, Failed or Not Executed. `qa/results/latest.txt` points at the newest run.

## Adding a case

Add rows to the CSVs in `qa/spec/` (the spec is the source of truth and is read at runtime). A test is tied to a row by its
title: start it with the Check ID (`CK-ENG-0007 ...`) or, for lifecycle, wrap each step in `test.step("LC-100 step 3 ...")`.
Tag a test `@known:Bug-006` (stays Failed in the CSV, does not fail the run) or `@pending-feature` (reported Not Executed).

## Write probes (valid-payload authorization probes)

`tests/probes/write-probes.spec.ts` sends valid write payloads as the correct role (must be 2xx) and as each wrong role on a
fresh fixture (2xx = authorization hole, 403 = fine). It creates real rows, so it only runs with `QA_WRITE_PROBES=1` and must be
wrapped in a dump/restore of the QA database (local only):

```bash
PGPASSWORD=qa pg_dump -h localhost -U qa -Fc easyconstruct_qa -f /tmp/qa-before.dump
QA_WRITE_PROBES=1 npx playwright test --project=write-probes --workers=1      # from qa/
# stop the API, then:
PGPASSWORD=qa pg_restore -h localhost -U qa -d easyconstruct_qa --clean --if-exists --no-owner /tmp/qa-before.dump
# delete files uploaded during the run from apps/api/uploads/{documents,generic}
```

Results are written to `qa/results/write-probes.json`.

## Reading the results

Each run writes `qa/results/<timestamp>/` (git-ignored): `01_access_matrix.csv`, `02_lifecycle_test_cases.csv`, `03_role_page_checks.csv`,
`manual-queue.csv` (Semi / Manual steps with what the human must check), `summary.csv` (per stage and per role), and `crawl-findings.json`
when the crawler ran. `qa/results/latest.txt` points at the newest run. A lifecycle step covered both through the API and through the UI
shows one row: a failure in either part makes it Failed and the Actual Results text is prefixed `[ui]` for the UI part.
`qa:findings` turns the failures into `qa/results/findings.md` (matrix disagreement, missing control, wrong data, crash/console error, known).

## Adding a case

* A new check: add a row to the matching CSV in `qa/spec/`. Page-level checks are picked up by the suites through `src/page-map.ts`
  (endpoint and sidebar label for a page); add the page there if it is new.
* A new lifecycle case: add a test in `tests/lifecycle/` titled with the case id and wrap each CSV step in `S.run(n, "...", ...)` from
  `src/kit.ts`; for a UI-driven run add it to `tests/lifecycle-ui/` with `[ui]` in the test title.
* Tags in a test title: `@known:Bug-006` (stays Failed, does not fail the run), `@pending-feature` (reported Not Executed).

## Flaky runs and merging results

A parallel `qa:full` loads the machine heavily. A failure that comes from the harness (a worker collision, a timeout in a long browser flow) can be re-run on its own
(`npx playwright test --project=lifecycle --project=lifecycle-ui`, no `--reporter` flag) and `qa:findings` accepts several run folders:
`npm run qa:findings -- results/<full-run> results/<re-run>`. For every row, the last folder in which it was executed wins.

## Matrix values (owner decisions of 2026-11-01)

`spec/01_access_matrix.csv` carries one value per role and page / action / function. Changes made on the owner's instruction are recorded in the Notes
column as "owner decision 2026-11-01 (...)".

| Value | What the API test asserts |
|---|---|
| Full | read 2xx; the page's write succeeds |
| View only | read 2xx; the write is refused with 403 (unless an ACTION row grants that role the write, for example Admin submits proposals) |
| Scoped | read 2xx; every returned row belongs to a project the user is assigned to (rows of other projects fail); write refused |
| Reference read | shared lookup data (document types, workflow templates): read 2xx for every signed-in role; write refused |
| Names only | read 2xx and rows carry only `id` and `name` |
| Directory only | read 2xx and rows carry only `id`, `employeeId`, `name`, `email`, `hasAccount` / `userId` |
| Deny | read 403; write 403 |
| Allowed (actions, functions) | a valid-payload request succeeds (2xx); for Deny it is refused (403) |

Operational roles (Project Manager, Architect, Engineer, Consultant, Site Personnel) are also scope-checked on any project data they may read.
Confirmed bugs awaiting a role-check fix are listed in `src/known.ts`; their tests carry `@known:role-check-fix-pending` (they stay Failed and do not fail the run).
Manual app findings live in `spec/app-findings.csv` and are merged into `qa/results/findings.md`.

**The API suite writes data.** Its write checks send valid payloads (on a fresh project each time) so that a 403 or a 2xx is conclusive; they create projects,
documents, proposals and similar rows in the QA database only. Run `npm run qa:reset` (or restore a dump) before a run that must start clean.
