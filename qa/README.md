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

| Command | What it does |
|---|---|
| `npm run qa:guard` | Validates the QA environment and prints the targets. |
| `npm run qa:reset` | Rebuilds the QA database: schema, accounts, employees, document types, `DEMO-STAGE-0..6`. |
| `npm run qa:api` | API permission suite from `01_access_matrix.csv` (Phase B). |
| `npm run qa:ui:access` | UI role suite: NAVIGATE, CONTENT, DENIED, READ-ONLY (Phase B). |
| `npm run qa:functional` | SEARCH / FILTER, PAGINATION, FORM VALIDATION (Phase C). |
| `npm run qa:lifecycle` | Lifecycle cases from `02` (Phase C). |
| `npm run qa:crawl`, `qa:smoke`, `qa:full`, `qa:findings` | Phase D. |

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
