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
