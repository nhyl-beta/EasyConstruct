# EasyConstruct — security and backup checklist

Branch `staging`. Written for objectives fix 1.5 (Objective 1, claim 1: the system keeps client data secure and recoverable).

How to read it: **Verified** means the behaviour is in the code and the file is named. **Not verified** means it cannot be seen from the repository (a host or account setting), so it is a step for the owner, with the exact thing to check. **Gap** means the code does not do it. Nothing here was tested against the running app or the production database.

## Summary

| # | Item | Status |
|---|---|---|
| 1 | Login rate limiting | Verified after this change (it was a gap) |
| 2 | Password policy | Verified, with one inconsistency |
| 3 | Session (JWT) expiry and revocation | Verified, long expiry noted; revocation on deactivation fixed |
| 4 | Secure headers | Verified after this change (it was a gap) |
| 5 | CORS origin | Verified |
| 6 | Secrets in environment only | Verified, one owner check |
| 7 | Neon backup and restore window | **Not verified** (owner step) |

## 1. Login rate limiting — Verified (changed in this fix)

- **Before:** none. `POST /api/auth/login` accepted unlimited attempts.
- **Now (per account):** five failed sign-ins for one email in 15 minutes refuse further attempts for that email with `429 TOO_MANY_ATTEMPTS` and a `retryAfterSeconds` field, until the oldest of the five ages out. The count is read from the failed-login rows already written to `audit_logs` (`server/src/auth/service.ts` `login`, `server/src/auth/throttle.ts`, `server/src/auth/repository.ts` `findRecentLoginFailures`). Because it reads the database it holds on every serverless instance. A refused attempt is logged as `login-throttled`, which does not count, so it cannot extend its own lockout. Tests: `server/src/auth/throttle.test.ts`.
- **Now (per address):** 40 sign-in requests per address per 15 minutes (`server/src/validators/routes.ts`). This one is held in memory, so on Vercel it applies per instance and only slows bulk guessing; it is not a guarantee.
- **Trade-off you should know:** someone who knows an email can make that account refuse sign-ins for up to 15 minutes by failing on purpose. The audit trail shows it. A correct password during a lockout is also refused.
- **Not done:** CAPTCHA, IP reputation, multi-factor sign-in. Out of scope for a low-risk change.

## 2. Password policy — Verified, one inconsistency

- New passwords must be at least 10 characters (`server/src/validators/user-validators.ts`, `auth-validators.ts`).
- **Reset-link** passwords additionally need an uppercase letter and a digit (`resetPasswordSchema`). **Accounts created or reset by IT Designer** need only the 10 characters (`user-validators.ts`). The comment in that file says the rules match; they do not. Recommendation: apply the reset rule to both. Not changed here because it alters what IT Designer can set today.
- Passwords are stored as bcrypt hashes, cost 10 (`auth/service.ts`, `users/service.ts`).
- A password change signs out every session issued before it (`middleware/auth.ts`, `passwordChangedAt`).
- Reset links: 256-bit random token, only its SHA-256 stored, single use, 30 minutes (`auth/service.ts`).

## 3. Session (JWT) expiry — Verified

- Tokens expire **30 days** after sign-in (`auth/service.ts` `JWT_EXPIRES_IN`). That is long for a system that holds payroll. It was not shortened because it would sign people out and there is no refresh token. Recommendation: 12 hours to 7 days plus a refresh step, as a separate change.
- The token format was not touched.
- **Fixed in this change:** deactivating an account did not end sessions already issued; only new sign-ins were refused. The session check now also looks at `is_active`, so a deactivated account's token is refused within the 15-second cache window (`middleware/auth.ts`, `auth/repository.ts` `findSessionState`).

## 4. Secure headers — Verified (changed in this fix)

- **Before:** none (no helmet, `X-Powered-By` on).
- **API now** (`server/src/middleware/security-headers.ts`, mounted in `app.ts`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security`, `X-DNS-Prefetch-Control`, `X-Permitted-Cross-Domain-Policies`; `X-Powered-By` removed. Test: `security-headers.test.ts`.
- **Client now** (`client/vercel.json`): `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (camera and geolocation allowed for the app itself, because attendance uses them), `Strict-Transport-Security`.
- **Deliberately not set:** `Content-Security-Policy`, `Cross-Origin-Resource-Policy`. A CSP for this app needs the map tile and geocoding hosts and the blob storage host worked out, and a wrong one breaks the site. Recommendation: add a report-only CSP first.

## 5. CORS origin — Verified

- One origin, from `CORS_ORIGIN` (default `http://localhost:5173`), credentials on, methods and headers listed (`server/src/config/cors.ts`).
- **Owner check:** on the deployed server project, `CORS_ORIGIN` must be the real client URL. If it is unset the server answers for `localhost` only.

## 6. Secrets in environment only — Verified, one owner check

- `.env` and `.env.*` are ignored by git; `server/.env.example` holds placeholders only (root `.gitignore`).
- No secret value is committed in the files read for this audit; this was a read of the code, not a scan of git history. Recommendation: run a secret scanner over the full history once.
- **Gap found and made loud:** if `JWT_SECRET` is not set the server falls back to a known development value (`server/src/config/env.ts`). It now logs an error when that happens in production. **Owner check:** confirm `JWT_SECRET` is set on the Vercel server project to a long random value. If it is not, rotate it as soon as it is set (everyone must sign in again).
- `CRON_SECRET` (new) protects the scheduled-job endpoints; they refuse every request when it is unset (`server/src/jobs/routes.ts`).

## 7. Neon backup and restore window — Not verified

This is a Neon account setting, not something the repository can show. What to check and record here:

- [ ] Which Neon plan the production project is on, and its **point-in-time restore window** (Console, project, Settings, Storage or Backup and Restore). Write the window here: ______
- [ ] That the window is long enough for the business. For payroll data a week or more is a reasonable minimum.
- [ ] A **restore drill**: create a branch from a past time (Console, Branches, Create branch, "Past data"), connect to it, and confirm a known recent record is there. Date of the last drill: ______
- [ ] Who in the company can do the restore, and that they have access to the Neon console.
- [ ] Uploaded files live in Vercel Blob, not the database. A database restore does not bring back a deleted file. Check the Blob store's own retention.
- What the repository does give you: `server/src/scripts/reset-demo-data.ts` writes a full JSON backup to `server/backups/` before it deletes anything, and `server/backups/` is git-ignored. That is for the demo reset only; it is not a production backup.

## Other things seen while auditing (not changed)

- Every API call is authenticated by a bearer token held in the browser. The token lives in browser storage, session storage for a tab-only session or local storage for a remembered one (`client/src/auth/session.ts`), so a cross-site scripting bug would expose it. This is why the missing CSP above matters.
- `GET /api/notifications/stream` accepts the token as a `?token=` query parameter because `EventSource` cannot send headers (`middleware/auth.ts`, `client/src/features/notifications/hooks/useNotificationStream.ts`). The app's own logger prints the route without the query string (`middleware/logger.ts`), but the host's request logs (Vercel) can record the full URL. Treat those logs as sensitive.
- The in-process overdue job for RFI/RFA requests does not run on Vercel (see the progress doc). Not a security item, but a scheduled-job gap.
