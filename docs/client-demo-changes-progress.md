# Client demo changes: progress

Branch `staging`, baseline commit `d959738`. Ten changes asked for after the client demo. Every change is its own commit (`feat(...): ... (#N)`), each with a system check under `server/src/scripts/system-check/change-NN-*.mjs`.

## Baseline (Phase 0)

| Command | Result at `d959738` |
|---|---|
| `npx tsc --noEmit` (server) | clean |
| `npm --prefix server test` | 785 tests, all pass |
| `npm --prefix client run build` (`tsc && refine build`) | builds |
| `npm --prefix client test` (vitest) | 324 tests, all pass |
| Lint | the client has no `lint` script and the server has none, so lint was not run |

What existed before, per change:

| # | Before | Finding |
|---|---|---|
| 1 | partly | Document type was a fixed `z.enum` of 11 on `POST /documents`; the multipart `/documents/upload` accepted any string. Lifecycle reads 7 names exactly (`lifecycle/gates.ts`, `lifecycle/service.ts`, `plan-suggestion/repository.ts`). |
| 2 | missing | No fingerprint stored anywhere. Upload paths: base64 (`uploads/service.ts`), multer to disk (`uploads/stream.ts`, `documents/upload.ts`), Blob client token. |
| 3 | missing | `logAudit` was not called from the download handler or the projects controller. |
| 4 | partly | One `client` / `clientEmail` on `projects`. |
| 5 | partly | One `recipient_email` / `email_status` on `design_requests`; one email, with attachments. |
| 6 | missing | Replies landed in the sender's mailbox; `client_replied` was set by hand. |
| 7 | missing | Outside clock-ins were saved `Flagged` and only seen at the daily exceptions check. |
| 8 | partly | In-app overdue alert existed. **Confirmed:** `design-requests/scheduler.ts` returns at once when `VERCEL` is set, and `/api/design-requests/sweep` (Admin-only, manual) was not in `server/vercel.json` crons, so on Vercel the RFI/RFA sweep never ran. Workflow stages had no overdue alert. |
| 9 | missing | `requirements/service.ts` let any Admin or PM decide; `POST /design-requests/:id/send` let Admin send. |
| 10 | missing | No report period; report types were engineering types. |

## Status

| # | Change | Status | Migration | Tests added | System check |
|---|---|---|---|---|---|
| 1 | Editable document types | Done | 0034 | `reference/document-types/rules.test.ts`, client sidebar test updated | `change-01-document-types.mjs` |
| 2 | Corrupted-file check | Done | 0035 | `uploads/integrity/rules.test.ts`, client `integrity-store.test.ts` | `change-02-file-integrity.mjs` |
| 3 | Log downloads and project edits | Done | none | `uploads/download-audit.test.ts`, `utils/diff-fields.test.ts` | `change-03-audit-downloads-edits.mjs` |
| 4 | Stakeholder list | Done | 0036 | `project-stakeholders/rules.test.ts`, client `stakeholder.repository.test.ts` | `change-04-stakeholders.mjs` |
| 5 | One RFI/RFA to several stakeholders | Done | 0037 | `design-requests/recipients.test.ts` | `change-05-multi-recipients.mjs` |
| 6 | Reply link, no login | Done | 0038 | `design-requests/reply-tokens.test.ts` | `change-06-reply-link.mjs` |
| 7 | Instant outside-radius alert | Done | none | `attendance/alert.test.ts` | `change-07-outside-alert.mjs` |
| 8 | Overdue emails | Done | 0039 | `jobs/overdue.test.ts` | `change-08-overdue-emails.mjs` |
| 9 | Approvals go to the PM | Done | none | `lifecycle/approval-authority.test.ts` | `change-09-pm-approvals.mjs`, lifecycle walk 87/87 |
| 10 | PM daily, weekly, monthly reports | Done | 0040 | `reports/periods.test.ts`, client `report-status.repository.test.ts` | `change-10-pm-reports.mjs` |

Supporting files for the checks: `change-lib.mjs` (sign-in and call helpers; refuses any API that is not `localhost:8123`) and `smtp-sink.mjs` (a Node-only SMTP server; an address containing `reject` is refused, which gives a partial send failure).

## What was built, and where

1. **Document types.** `document_types` table; list / add / rename / deactivate at `/api/reference/document-types` for Admin and IT Designer; 7 system types (the ones the gates read) plus the 3 report types cannot be renamed or deactivated; Legal category seeded. Upload dialogs and Legacy Import read the list from the API. Renaming a normal type also moves the documents filed under the old name (in one transaction).
2. **Corrupted-file check.** `stored_files` table. SHA-256 on every upload path (base64, multer streaming and the documents upload hash from disk in chunks; Blob client-direct is hashed in the `upload-completed` callback). Downloads hash while streaming; a mismatch sets `damaged`, writes an `integrity_failed` audit entry and notifies Admin and IT Designer. `POST /api/uploads/verify` checks without sending the file; `POST /api/uploads/integrity` feeds the Verified / Unverified / Damaged badge next to file links; a damaged file asks before it opens or downloads.
3. **Logging.** Every download (and refused attempt) is audited with who, file, url, project and result; Legal-category documents are `sensitive_download` and show in Security Monitoring. Project create / update / delete log changed fields as old → new. The audit API gained an `actions` filter so Security Monitoring no longer loads the whole trail; Activity Logs has a Downloads filter.
4. **Stakeholders.** `project_stakeholders`; CRUD at `/api/stakeholders`; only PM and Admin see emails and phones; `projects.client` / `client_email` follow the first Owner. Wizard step and a Stakeholders section on the project page. Backfill: `npm --prefix server run db:backfill-stakeholders` (dry run unless `--apply`).
5. **Several recipients.** `design_request_recipients`; one email per person (files read once); per-recipient sent / failed / replied and Resend (max 3 each). A request made before this existed gets its one recipient row the first time it is opened.
6. **Reply link.** `design_request_reply_tokens` (hash only, 32 random bytes, 14 days, single use) and public routes under `/api/public/rfi-replies`: open, attachment download, one answer with up to 5 files. Rate limited per address, every open / download / refusal / submit audited. Public page `/reply/:token`.
7. **Instant alert.** After a `Flagged` clock-in is saved (including offline-synced), PM, HR and Admin are notified in-app; the link opens the HR attendance page filtered to that record and highlighted.
8. **Overdue emails.** `/api/cron/overdue` (daily, `0 1 * * *`) runs the RFI/RFA sweep and a new 48-hour workflow-stage sweep, then emails the assignee and every Admin at most once per item per person per day (`overdue_reminders`). `users.email_overdue_reminders` (default on) with a Settings page (click your name in the sidebar).
9. **PM approvals.** `lifecycle/approval-authority.ts`: only the project's own PM approves or rejects a requirement or sends an RFI/RFA; Admin needs a written reason of 10+ characters, audited. Admin screens show an Override action with a reason box.
10. **Reports.** Daily / Weekly / Monthly Report types, `documents.report_period` and `period_date`, pure period maths, a Reports tab on the project page (grid, upload that pre-fills type and period), and a missing-report reminder to the PM inside the overdue job.

## Decisions made (the brief left them open)

- **Email status of a request** follows the first recipient (as asked); the new per-recipient list is the real source. A recipient whose address the mail server refuses now counts as failed even when the Cc was accepted (a mailer fix).
- **Admin raising an RFI/RFA** without an override reason makes a draft the PM then sends; with a reason it is sent and audited.
- **Overdue emails repeat daily** while an item stays overdue (the in-app alert goes once). Missing-report reminders (in-app and email) go **once per missing period**.
- **Report types are system types** (not in the brief's list) because the reminder reads them by name.
- **Workflow stage "became active"** is `workflow_stages.updated_at` of a `current` stage, the same measure the existing stalled-stage signal uses.
- **Site Personnel** keep only the four Field document types in their upload form (category "Field"), as before.
- **Public upload limits:** 5 files, 4 MB each by default, because Vercel functions accept about 4.5 MB per request.
- **Damaged-file warning** before opening is a browser confirm dialog (one shared place, `lib/file-url.ts`).

## Deviations and limits

- **Two unauthenticated route families were added.** The reply-link routes (as asked) and `POST /api/uploads/client-token` for Vercel Blob's signed `upload-completed` callback (needed by change #2; `handleUpload` refuses it unless Vercel's signature is valid). Everything else stays behind sign-in.
- **Rate limiting is in memory per server instance** (the existing `hitLimiter`), so it slows one address on one instance. The 256-bit token is what stops guessing.
- **Vercel cron count:** `vercel.json` now has three crons. A Hobby plan allows two; check the plan.
- **No lint** was run (neither package has a lint script).
- `uploads/` files from earlier deployments that sit on a Vercel tmp disk are not fingerprinted and show as Unverified; that is the stated behaviour for files without a record.

## Manual steps for the owner

1. **Neon / migrations.** Review, then apply `0034` to `0040` in order with `npm --prefix server run db:migrate -- --dry-run` and then without `--dry-run`, against the staging database (which shares production data). All are additive and safe to run twice. They add tables `document_types`, `stored_files`, `project_stakeholders`, `design_request_recipients`, `design_request_reply_tokens`, `overdue_reminders`; nullable columns on `documents`, `design_requests`, `design_request_files`, `design_request_recipients`; and `users.email_overdue_reminders` (default true, so every user starts opted in).
2. **Owner backfill.** `npm --prefix server run db:backfill-stakeholders` shows what it would add; add `-- --apply` to write one Owner stakeholder per project that has a client.
3. **Vercel env (server project):** `CRON_SECRET` (long random; required for the cron routes), `APP_URL` (the real client address, used in reply links and emails), and the existing `MAIL_USER`, `MAIL_APP_PASSWORD`, `MAIL_FROM`. Optional: `RFI_REPLY_TOKEN_DAYS` (14), `RFI_REPLY_MAX_FILES` (5), `RFI_REPLY_MAX_FILE_MB` (4), `COMPANY_NAME`, `WORKFLOW_STAGE_OVERDUE_HOURS` (48), `REPORT_WORKING_DAYS` (all days). All are documented in `server/.env.example`.
4. **Vercel Cron:** the new `/api/cron/overdue` entry is in `server/vercel.json` (daily, 01:00 UTC = 09:00 Manila). If the plan limits cron jobs, merge or drop one.
5. **Vercel Blob webhook:** the direct-upload `upload-completed` callback needs the server's public URL reachable by Vercel; files uploaded straight to Blob from a machine without that (local development) stay Unverified.
6. **Mail:** the reply links and overdue emails use the same Gmail App Password mailer; without it the request is saved and marked failed, and the overdue job reports `mailConfigured: false`.

## What was verified, and what was not

Verified against a local throwaway Postgres (Docker) and a local API, never Neon: every change's system check passes; the lifecycle walk passes 87/87 (gates C1, X5, D4, T4 included); the Document Types page, the integrity badge, the reply page at phone width, the attendance highlight and the Reports tab were checked in a browser.

Not verified: real Gmail delivery, the Vercel Blob `upload-completed` callback, the Vercel Cron schedule on the deployed project, behaviour against the real data on Neon (migrations were applied to an empty-ish local database, not to production), and the whole UI-check suite (`ui-check.mjs`, `mobile-layout-check.mjs`) which needs Playwright.

## Daily summary email

Change to change #8. Overdue emails used to be one per item per person per day. Now each person gets **at most one summary email a day** listing everything overdue for them.

What changed:
- `server/src/jobs/overdue.ts` (pure): `planDigests` drops already-sent items, opted-out people, people without an address and demo/test addresses, then groups what is left by person; `buildDigestEmail` writes the text and HTML (sections RFI/RFA overdue, Approvals waiting, Missing reports; 25 lines per section; footer pointing to Settings); `isUndeliverableEmail` and `skipDomainsFromEnv`. The old `planEmails` and `buildOverdueEmail` are gone.
- `server/src/jobs/overdue-service.ts`: each section only collects candidates (in-app alerts are unchanged); one send per digest. `OverdueRunResult.emails` is now `digestsSent`, `digestsFailed`, `itemsIncluded` plus the skip counters (`skippedUndeliverable` is new) and `mailConfigured`; each section's `emailed` is the number of its items in sent summaries.
- `server/src/jobs/overdue-repository.ts`: `recordDigestSent` writes a row per item and a per-person `digest` row for today in one transaction, only after the mail went out. `emailKeysSentOn` reads several days.
- `server/src/jobs/reports-check.ts`, `server/src/design-requests/service.ts`: item fields for the summary lines; a demo/test recipient of an RFI/RFA is marked failed ("address is a demo/test domain") instead of being sent.
- `client/src/pages/settings.tsx`: the toggle text says reminders now come as one daily email. `server/.env.example`: `MAIL_SKIP_DOMAINS`.

Decisions:
- No migration: the per-person per-day guard reuses `overdue_reminders` (`item_type = 'digest'`, `item_id = 0`). Items that become overdue after today's summary went out wait for tomorrow.
- A failed send records nothing, so the whole summary is retried on the next run. A missing-report period is still emailed once (its record is kept under the period start).
- The demo address default means the demo accounts (`*@easyconstruct.demo`) are never emailed; set `MAIL_SKIP_DOMAINS` to change that.

Manual steps: none required. Optional: set `MAIL_SKIP_DOMAINS` on Vercel.

Testing: left to the owner. No new tests or system checks were written for this change, the overdue job was not run and no email was sent. The stale unit tests for the removed per-item functions were deleted, and the older `change-08-overdue-emails.mjs` and `change-10-pm-reports.mjs` checks still expect per-item emails and the old result fields, so they need updating before they are used again.

## Test run

Date: 2026-10-17. Commit tested: `207da30` plus the fix `41fee3d`. Everything ran on a throwaway local Postgres (Docker, port 54329) and a local API on port 8123 with mail going to the local SMTP sink. Neon was never touched and no real email was sent.

Setup note: the migration chain cannot build a fresh database (migration `0011` fails with "payroll_batches already exists", the known issue in `system-check/README.md`). The local schema was built with `drizzle-kit push` instead and the document types were seeded with `db:seed-document-types`; migrations `0034` to `0040` were also applied by hand earlier and ran cleanly.

| Area | Result |
|---|---|
| Server typecheck | clean |
| Server tests, `npm --prefix server test` | 904 pass, 0 fail (baseline 883, +21 new summary-email tests) |
| Server tests, `node --import tsx --test 'src/**/*.test.ts'` | 904 pass, 0 fail |
| Client typecheck, vitest, build | clean, 333 pass, builds |
| System checks 01 to 07, 09 | pass (16, 19, 16, 19, 18, 35, 14, 19 checks) |
| System check 08 (summary email), default skip list | pass (22): one email per person, none to demo addresses, same-day rerun sends nothing, a refused send records nothing and is retried whole, opt-out respected, in-app alerts unchanged |
| System check 08, `MAIL_SKIP_DOMAINS` empty | pass: a demo-domain user does get the summary |
| System check 10 (reports) | pass (25): one summary a day, a period is emailed once, a period with no sent record is emailed, setting off sends nothing |
| Lifecycle walk | 87/87 |
| Route inventory and sweep (304 routes, 10 roles) | 0 server errors, 0 unauthenticated 2xx on non-public routes, 0 empty-body mutations accepted |
| `files.ts`, `demo-verify.ts` | files report 36 pass, 0 fail; demo-verify only flags two fake file urls (`x.txt`, `x.pdf`) that the checks themselves created |
| `ui-check.mjs` | did not complete: it ran about 50 minutes with no output and had to be stopped (exit 255). Not re-run. `mobile-layout-check.mjs` was not run |

Browser walkthrough (real browser against the local client and API, as Admin unless noted):

| # | Result | Note |
|---|---|---|
| 1 | pass | Document Types page lists the 19 types by category, system types carry the lock badge, a new type is present |
| 2 | pass (data) | two files marked damaged in `stored_files` and four "Damaged file detected" notifications; the badge itself was seen in the earlier browser pass |
| 3 | pass | Downloads chip on Activity Logs; Security page loads the sensitive filter |
| 4 | pass | Stakeholders section on the project page. An Engineer not seeing emails was checked through the API (check 04), not in the browser |
| 5 | pass | request detail shows per-recipient Failed, Resend and "No resends left" |
| 6 | pass | the reply page was filled in and submitted in the browser; the answer was stored and the link then answered "already sent" |
| 7 | pass | `/attendance?highlight=<id>` filters to the clock-in and shows the alert banner |
| 8 | pass | the Settings page shows the "Email me overdue reminders" switch; the summary email is covered by check 08 |
| 9 | pass | Admin sees Override buttons instead of Approve and Reject |
| 10 | pass | Reports tab grid (green and red), and a red period opens the upload dialog pre-filled with the type and period |

Bug found and fixed: in the summary email, report lines repeated the project code (`DEMO-S4 · DEMO-S4: Daily Report missing`). Fixed in the email only (`subjectWithoutCode`, commit `41fee3d`) with tests; the in-app wording is unchanged.

Needs a decision:
- Every Admin gets a summary of every overdue item in the system (that is how change #8 chose recipients). With several Admin accounts this is still one email each, but a long one. Say if Admins should see only their own items.
- With the default skip list the demo accounts are never emailed, so a demo of the daily summary needs `MAIL_SKIP_DOMAINS` set to something harmless.
- `ui-check.mjs` hung locally; it needs looking at before it is trusted again.

Cannot be tested locally: real Gmail delivery, the Vercel Blob `upload-completed` callback, Vercel Cron on the deployed project, and the migrations against the real Neon data.

## Admin overview email

Date: 2026-10-18. The daily summary used to list every overdue item in the system to every Admin (95 items across 17 summaries in the test run). Now an Admin gets two parts; everyone else is unchanged.

What an Admin's email contains:
1. **Your items.** Items where the Admin is a real owner (assignee, raiser, the stage's approver, the PM), listed in full with the same sections, line format and 25-line cap as before.
2. **Across all projects.** Every other overdue item, not listed one by one: one line per project with counts per kind, for example `DEMO-S4 · 12 RFI/RFA overdue · 2 approvals waiting · 1 missing report`, most items first (then project code), at most 15 lines plus "and N more projects". Each line links to `/dashboard` (the Admin dashboard already has the "needs attention" card; it has no project filter, so no filter is added and no new page was built). Omitted when nothing else is overdue; with no own items the email is only this part.

Subject for an Admin: `EasyConstruct: 3 items need your attention, 95 overdue across 6 projects` (singular forms: `1 item needs your attention, 1 overdue across 1 project`; overview only: `EasyConstruct: 95 items overdue across 6 projects`). Non-Admin subjects are unchanged.

How it works:
- Ownership comes from the candidate data: each candidate carries `recipients` (the real owners) and `admins` (Admins who are there only because they are Admin). `planDigests` lists an item in full for an owner and counts it in the overview for an Admin who is not an owner; an Admin who is an owner sees it under Your items only, never counted twice. The role is read with the person, nothing is looked up again.
- Missing reports: the PM (real owner) keeps the once-per-period email; for Admins a missing report only counts in the overview. A project with no PM now also counts for Admins (it was dropped before).
- Dedupe: the per-person per-day `digest` key still allows one email a day. Own items are recorded per item as before; overview items are not recorded, so the overview is recomputed every day while things stay overdue.
- The "Email me overdue reminders" switch, the undeliverable-address guard and `MAIL_SKIP_DOMAINS` apply to Admins as before; an opted-out Admin gets neither part.
- `OverdueRunResult.emails` gains `adminOverviewProjects` (project lines rendered in the summaries that were sent; capped at 15 per email).
- The Settings page has one extra sentence for Admins.
- In-app alerts are unchanged. No migration.

Known limit (not changed here): when a stage belongs to a role (for example Finance), or a project has no `pmUserId`, `stageOwners()` gives the item to every user with that role, so each of them gets it under their own items.

Tests: 12 new unit tests in `jobs/overdue.test.ts` (2 own + 30 others over 4 projects gives 2 full lines and 4 overview lines; overview only; an Admin who is also the assignee; ordering; the 15-project cap; subject wording; same-day rerun; opted-out Admin; non-Admin text unchanged against a fixed snapshot). `change-08-overdue-emails.mjs` has an Admin scenario against the sink: one email, the Admin's own RFI listed in full, the architect's RFIs not listed one by one, overview lines linking to the dashboard, far fewer lines than overdue items (4 lines for 25 overdue items in the run), the subject counting both parts.

Manual steps for the owner: none. With the default `MAIL_SKIP_DOMAINS` the demo accounts are still never emailed.

## Fresh database setup

Problem: the migration chain cannot build an empty database (`0011` fails with "payroll_batches already exists" because `0006` created it), and it also stops short of the Drizzle schema: a database built by replaying every migration statement lacks tables the app uses (for example `milestones`, `password_reset_tokens`, `reference_snapshots`, `design_engineers`) and many columns. Neon works because it was built before the chain was baselined. A client's own server needs another way.

What was added (nothing in `server/drizzle/` changed):
- `npm --prefix server run db:bootstrap` (`src/scripts/bootstrap-db.ts`, pure parts in `src/db/bootstrap.ts`). It refuses unless the database is empty (`public.projects` must not exist and `drizzle.__drizzle_migrations` must be missing or empty), prints the target host, and needs `--yes`; `--dry-run` shows the plan. It then (1) builds the schema from the Drizzle schema with drizzle-kit's own diff (`drizzle-kit/api` `pushSchema`, non-interactive), (2) creates what only the migrations define, (3) inserts the reference data, (4) records every migration in `drizzle.__drizzle_migrations` with the same hash and timestamp `migrate.ts` writes.
- `npm --prefix server run db:verify-schema` (read-only, exits 1 on a real difference): drizzle-kit's diff minus what it always reports (ROW LEVEL SECURITY, numeric `DEFAULT 0` rewrites, foreign keys whose names Postgres cut to 63 characters), plus a check that the migration-only sequences and indexes exist.
- `docs/setting-up-a-new-server.md`, and `system-check/README.md` now uses `db:bootstrap` instead of the manual `drizzle-kit push` steps.

**`db:bootstrap` must never be pointed at an existing database such as Neon.** It would refuse (Neon has `public.projects` and journal rows), but do not try.

Objects the migrations create that the Drizzle schema does not describe (found by diffing a `drizzle-kit push` database against a replayed-migrations database; `EXTRA_SEQUENCES`, `EXTRA_INDEXES`): 4 sequences (`purchase_request_seq`, `procurement_order_seq`, `reimbursement_seq`, `expense_seq`; used by `finance/purchasing/ids.ts`) and 9 indexes (`design_requests_assignee_idx`, `design_requests_project_idx`, `design_revisions_design_version_uq`, `documents_report_idx`, `plan_suggestion_items_suggestion_idx`, `plan_suggestions_project_idx`, `projects_client_id_idx`, `stored_files_status_idx`, `transmittals_project_seq_uq`). Plain `drizzle-kit push` would drop these indexes and sequences, which is one more reason not to use it on a bootstrapped database. The legacy table `project_engineers` (replaced by `project_members` in the Drizzle schema) is not created.

Reference-data audit: every migration 0000 to 0040 was searched for INSERT, UPDATE and DELETE statements.

| Migration | Statement | Bootstrap |
|---|---|---|
| `0022_design_delivery` | INSERT workflow template "Design Turnover" | run (insert-if-missing) |
| `0026_expense_categories` | INSERT the 10 starting expense categories | run (`ON CONFLICT DO NOTHING`) |
| `0034_document_types` | INSERT the 16 starting document types | run (`ON CONFLICT DO NOTHING`) |
| `0040_pm_reports` | INSERT Daily, Weekly and Monthly Report types | run (`ON CONFLICT DO NOTHING`) |
| `0015_payroll_lifecycle` | UPDATE payroll_batches status 'rejected' | not run: changes existing rows only |
| `0019_fix_report_project_case` | UPDATE engineering_reports project case | not run: changes existing rows only |
| `0024_cash_flow_month_unique` | DELETE duplicate cash flow months | not run: changes existing rows only |

The INSERT statements are taken from the migration files themselves, so there is one copy. No other migration changes rows (no statutory rate versions or other seeds live in migrations). A unit test fails if a future migration adds an INSERT, UPDATE or DELETE that `DATA_MIGRATIONS` does not classify, so new reference data cannot be forgotten. Other data a new server may want is not in migrations: `reference_snapshots` (the price catalog, filled by `npm run ai:seed-references`, which calls the live EstimationPro.ai API; the demo seed `demo-seed-stages` needs it) and the demo data (`db:seed`, `demo:seed`).

Tests: 15 unit tests in `src/db/bootstrap.test.ts` (empty-database guard, data-step list, bookkeeping rows, extra objects, schema-noise filter). On a new empty local database: `db:bootstrap --dry-run` and `--yes` worked (10 expense categories, 19 document types, 1 workflow template, 41 migrations recorded); a second `db:bootstrap` refused; `db:migrate -- --dry-run` said "Nothing to apply. 41 of 41 migrations are already recorded."; `db:verify-schema` passed, and it fails when a column is dropped or an index is missing; `db:seed` and the full `demo:seed` chain worked; the lifecycle walk passed 87/87; checks `change-01` to `change-10` passed (08 in both skip-list modes).

Migration files unchanged: `git diff 5e6fe18 -- server/drizzle` is empty; all 41 migration files and all 41 journal entries are identical to `5e6fe18`, so every hash `migrate.ts` computes (and Neon has recorded) is the same.

Test fixes found on the way: `change-04` built "today" in UTC while the server uses the Manila day, so it failed between 00:00 and 08:00 Manila time; it now uses the Manila date. My own negative test (dropping a column) had damaged the first bootstrapped test database, so it was rebuilt from empty before the final runs.

Manual steps for the owner: none for Neon. For a new server follow `docs/setting-up-a-new-server.md`.

Needs a decision:
- An Admin's overview links to `/dashboard` because the dashboard has no project filter. Say if a per-project link is wanted.
- `db:bootstrap` needs `drizzle-kit` (a dev dependency) installed on the new server; `npm ci` without `--omit=dev` is enough.
