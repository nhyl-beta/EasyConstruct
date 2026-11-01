// Builds the environment for child processes (migrations, seeds, the API). It is built from scratch, never by
// spreading process.env, so DATABASE_URL / mail / blob settings from the shell or apps/api/.env cannot leak in.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { QaConfig } from "../guard.js";
import { QA_OWNER_EMAIL } from "../roles.js";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const API_DIR = join(REPO_ROOT, "apps", "api");

export function apiPort(cfg: QaConfig): string {
  return new URL(cfg.apiUrl).port || "8123";
}

export function qaChildEnv(cfg: QaConfig): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "USER", "LANG", "TMPDIR", "SHELL", "NODE_OPTIONS"] as const;
  const env: NodeJS.ProcessEnv = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  return {
    ...env,
    NODE_ENV: "development",
    DATABASE_URL: cfg.databaseUrl,
    ALLOW_DEMO_RESET: "true",
    DEMO_RESET_ALLOWED_HOSTS: cfg.dbHost,
    DEMO_OWNER_EMAIL: QA_OWNER_EMAIL,
    SMOKE_BASE_URL: cfg.apiUrl,
    PORT: apiPort(cfg),
    JWT_SECRET: "qa-test-only-secret-not-for-production",
    CORS_ORIGIN: cfg.baseUrl,
    APP_URL: cfg.baseUrl,
    FEATURE_AI: "true",
    DISABLE_SCHEDULER: "true",
    DOTENV_CONFIG_PATH: join(REPO_ROOT, "qa", ".no-such-env"), // never load apps/api/.env
    // Deliberately unset: MAIL_*, BLOB_READ_WRITE_TOKEN, S3_*, UPSTASH_* (no mail, no real storage, no shared cache).
  };
}
