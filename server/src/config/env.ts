import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

export const env = {
  PORT:         parseInt(process.env.PORT ?? '8000', 10),
  DATABASE_URL: required('DATABASE_URL'),
  NODE_ENV:     process.env.NODE_ENV ?? 'development',
  JWT_SECRET:   process.env.JWT_SECRET ?? 'dev-secret-change-in-prod',
  CORS_ORIGIN:  process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  // Origin the password-reset link points at. Defaults to the CORS origin,
  // which is already the browser app's address in every environment.
  // CLIENT_URL is accepted as a synonym. Set it per environment to the
  // address the browser app is actually served from — the link in a recovery
  // email opens on the recipient's machine, so localhost only works when the
  // client runs on that same machine.
  APP_URL:      (process.env.APP_URL ?? process.env.CLIENT_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, ''),
  // Outgoing mail (Gmail SMTP). See mail/mailer.ts and .env.example.
  MAIL_USER:         process.env.MAIL_USER,
  MAIL_APP_PASSWORD: process.env.MAIL_APP_PASSWORD?.replace(/\s+/g, ''),
  MAIL_FROM:         process.env.MAIL_FROM,
  MAIL_HOST:         process.env.MAIL_HOST ?? 'smtp.gmail.com',
  MAIL_PORT:         parseInt(process.env.MAIL_PORT ?? '465', 10),
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  // Largest file the streaming / direct-to-storage upload paths accept (MB).
  MAX_UPLOAD_MB: Math.max(1, parseInt(process.env.MAX_UPLOAD_MB ?? "100", 10) || 100),
  // Decision-support cost comparisons (server/src/ai-validation/cost.ts)
  // convert catalog USD prices to PHP with this dated constant rather than a
  // live FX API — S-2. Every stored comparison records both fields so the
  // rate used is always visible, not just the current default.
  // Shared secret for scheduled jobs under /api/cron (Vercel Cron sends it as a
  // Bearer token). When unset the cron endpoints refuse every request.
  CRON_SECRET: process.env.CRON_SECRET || undefined,
  FX_RATE_USD_PHP: parseFloat(process.env.FX_RATE_USD_PHP ?? '62.73'),
  FX_RATE_AS_OF:   process.env.FX_RATE_AS_OF ?? '2026-09-22',
} as const;