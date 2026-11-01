// qa/src/guard.ts — the ONE safety gate. Every qa entry point (reset, Playwright config, CLI) calls
// assertQaEnvironment() first. Nothing in qa/ reads DATABASE_URL for use; it is only read here to be
// compared against, so the suite can never point at the database the app normally uses.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Production Neon host. Never allowed, in any form. */
export const PROD_DB_HOST = "ep-fancy-king-aofmiicn";
/** Production web/API domain. Never allowed in QA_BASE_URL / QA_API_URL. */
export const PROD_DOMAIN = "easyconstruct.online";
export const DEFAULT_WEB_PORT = 5173; // apps/web/vite.config.ts
export const DEFAULT_API_PORT = 8123; // the demo/QA API port convention (apps/api/scripts/demo/demo-guard.ts)

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export interface QaConfig {
  databaseUrl: string;
  dbHost: string;
  dbPort: string;
  dbName: string;
  baseUrl: string;
  apiUrl: string;
}

export class GuardError extends Error {
  constructor(readonly problems: string[]) {
    super(`QA GUARD REFUSED TO START:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "GuardError";
  }
}

export interface DbTarget { host: string; port: string; name: string }

export function parseDbUrl(raw: string): DbTarget | null {
  try {
    const u = new URL(raw);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    return { host: u.hostname.toLowerCase(), port: u.port || "5432", name: u.pathname.replace(/^\//, "") };
  } catch {
    return null;
  }
}

const isLocal = (host: string) => LOCAL_HOSTS.has(host);

/** True when `a` and `b` are the same database. A remote host alone identifies a database; on this
 *  machine every database shares "localhost", so host+port+name is compared instead. */
function sameDatabase(a: DbTarget, b: DbTarget): boolean {
  if (a.host !== b.host) return false;
  if (isLocal(a.host)) return a.port === b.port && a.name === b.name;
  return true;
}

/** Pure check: returns every reason to refuse (empty array = allowed). `otherDbUrls` are DATABASE_URL values
 *  found in the environment and .env* files, labelled by source. */
export function checkQaEnvironment(
  env: Record<string, string | undefined>,
  otherDbUrls: { source: string; url: string }[] = [],
): { problems: string[]; config?: QaConfig } {
  const problems: string[] = [];
  const raw = env.QA_DATABASE_URL?.trim();
  let target: DbTarget | null = null;

  if (!raw) {
    problems.push("QA_DATABASE_URL is not set. The QA suite never falls back to DATABASE_URL.");
  } else {
    target = parseDbUrl(raw);
    if (!target) problems.push("QA_DATABASE_URL is not a valid postgres:// URL.");
  }
  if (raw && raw.toLowerCase().includes(PROD_DB_HOST)) {
    problems.push(`QA_DATABASE_URL points at the production host ${PROD_DB_HOST}.`);
  }
  if (target) {
    if (target.host.includes(PROD_DB_HOST)) problems.push(`QA_DATABASE_URL host is the production host ${PROD_DB_HOST}.`);
    if (!target.name) problems.push("QA_DATABASE_URL has no database name.");
    for (const o of otherDbUrls) {
      const other = parseDbUrl(o.url);
      if (other && sameDatabase(target, other)) {
        problems.push(`QA_DATABASE_URL is the same database as DATABASE_URL in ${o.source} (host ${other.host}). Use a separate QA database.`);
      }
    }
  }

  const baseUrl = env.QA_BASE_URL?.trim() || `http://localhost:${DEFAULT_WEB_PORT}`;
  const apiUrl = env.QA_API_URL?.trim() || `http://localhost:${DEFAULT_API_PORT}/api`;
  for (const [name, value] of [["QA_BASE_URL", baseUrl], ["QA_API_URL", apiUrl]] as const) {
    if (value.toLowerCase().includes(PROD_DOMAIN)) problems.push(`${name} contains the production domain ${PROD_DOMAIN}.`);
    try { new URL(value); } catch { problems.push(`${name} is not a valid URL.`); }
  }

  if (problems.length > 0 || !target || !raw) return { problems };
  return { problems, config: { databaseUrl: raw, dbHost: target.host, dbPort: target.port, dbName: target.name, baseUrl, apiUrl } };
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** QA_* variables from qa/.env.qa (git-ignored), so the connection string never has to be typed or pasted. Real
 *  environment variables win over the file. Only QA_* keys are read; anything else in the file is ignored. */
export function qaEnv(root = repoRoot, base: Record<string, string | undefined> = process.env): Record<string, string | undefined> {
  const file = join(root, "qa", ".env.qa");
  const fromFile: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?(QA_[A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m) fromFile[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
    }
  }
  return { ...fromFile, ...base };
}

/** DATABASE_URL values from every .env* file (not *.example) under the repo, plus the live environment. */
export function collectOtherDatabaseUrls(root = repoRoot, env: Record<string, string | undefined> = process.env): { source: string; url: string }[] {
  const found: { source: string; url: string }[] = [];
  if (env.DATABASE_URL) found.push({ source: "the DATABASE_URL environment variable", url: env.DATABASE_URL });
  const dirs = [root, join(root, "apps", "api"), join(root, "apps", "web"), join(root, "qa")];
  for (const dir of dirs) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (!f.startsWith(".env") || f.endsWith(".example")) continue;
      for (const line of readFileSync(join(dir, f), "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.+?)\s*$/);
        if (m) found.push({ source: join(dir, f), url: m[1]!.replace(/^["']|["']$/g, "") });
      }
    }
  }
  return found;
}

/** Call first, from every entry point. Throws GuardError; use guardOrExit() in CLIs. */
export function assertQaEnvironment(env: Record<string, string | undefined> = qaEnv(), root = repoRoot): QaConfig {
  const { problems, config } = checkQaEnvironment(env, collectOtherDatabaseUrls(root, env));
  if (problems.length > 0 || !config) throw new GuardError(problems);
  return config;
}

export function guardOrExit(): QaConfig {
  try {
    return assertQaEnvironment();
  } catch (e) {
    console.error(e instanceof GuardError ? e.message : e);
    process.exit(1);
  }
}

/** Extra gate for destructive reset only: the database must look like a QA/test database or be local. */
export function assertResetAllowed(cfg: QaConfig, env: Record<string, string | undefined> = process.env): void {
  const ok = isLocal(cfg.dbHost) || /(qa|test)/i.test(cfg.dbName) || env.QA_ALLOW_ANY_DB_NAME === "true";
  if (!ok) {
    throw new GuardError([
      `Reset refused: database "${cfg.dbName}" on ${cfg.dbHost} is not local and its name does not contain "qa" or "test". ` +
        `Rename the database/branch, or set QA_ALLOW_ANY_DB_NAME=true if you are certain it is throwaway.`,
    ]);
  }
}
