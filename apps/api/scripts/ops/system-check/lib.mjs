// Shared helpers for the browser and database check scripts (.mjs). Works on Windows and Linux.
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

/**
 * Browser for Playwright. Set CHROME_PATH (PowerShell):
 *   $env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
 * The fallback is the path in the original Linux sandbox.
 */
export const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export const WEB = process.env.WEB_BASE ?? "http://localhost:5173";

/** Creates an output folder (and parents) if it is missing, and returns its name. */
export const ensureDir = (dir) => {
  mkdirSync(dir, { recursive: true });
  return dir;
};

/**
 * Runs one SQL statement against the THROWAWAY database and returns the trimmed output (-At: no
 * headers, unaligned). The SQL goes in on stdin, so quotes and | in it need no shell escaping.
 *
 * Default (works on Windows with Docker):  docker exec -i ec-check psql -q -U postgres easyconstruct_check -At
 * Override with PSQL_CMD, a command that reads SQL on stdin, for example the old socket form:
 *   $env:PSQL_CMD = "psql -q -h /tmp -p 5544 -U postgres easyconstruct_check -At"
 * or a local psql:
 *   $env:PSQL_CMD = "psql -q -h localhost -p 5544 -U postgres easyconstruct_check -At"
 */
export const PSQL_COMMAND = process.env.PSQL_CMD ?? "docker exec -i ec-check psql -U postgres -q easyconstruct_check -At";

export const psql = (query) => {
  const q = query.trim().endsWith(";") ? query : `${query};`;
  return execSync(PSQL_COMMAND, { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
};

export const API = process.env.SMOKE_BASE_URL ?? "http://localhost:8123/api";

/**
 * Run first by every browser check. Signs in once through the API and refuses to continue when
 * (a) the API cannot sign in (limiter, wrong seed) or (b) the API would upload to the REAL Vercel
 * Blob store. Exits with code 2 and a plain message instead of producing results that look fine.
 */
export async function preflightApi(email = "admin@easyconstruct.demo", password = "Demo@12345") {
  const login = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }).catch((e) => ({ ok: false, status: 0, error: e }));
  if (!login.ok) {
    console.error(`\n✘ Cannot sign in as ${email} (status ${login.status}). Do not trust any result from this run.\n  Is the API running on ${API}? If it says "Too many sign-in attempts", restart the API (system-check/start-api.ps1).`);
    process.exit(2);
  }
  const token = (await login.json()).data.token;
  const cfg = await fetch(`${API}/uploads/config`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null);
  if (cfg?.data?.mode === "blob" && process.env.ALLOW_BLOB !== "true") {
    console.error("\n✘ REFUSED: the API is configured for Vercel Blob, so this check would upload files to the REAL Blob store.\n  Start the API with DOTENV_CONFIG_PATH=.env.check (system-check/start-api.ps1), or set ALLOW_BLOB=true if that is intended.");
    process.exit(2);
  }
}

/** After a browser pass: stop with a non-zero exit when any role could not sign in. */
export function failIfBrowserLoginsFailed(results) {
  const bad = results.filter((r) => r.loginOk === false || r.loginFailed || r.fatal).map((r) => r.role);
  if (bad.length === 0) return;
  console.error(`\n✘ Sign-in or run failed for: ${bad.join(", ")}. Do not trust the results above for these roles.\n  Usual cause: the sign-in limiter (40 per 15 minutes per address). Restart the API (system-check/start-api.ps1) and run again.`);
  process.exitCode = 2;
}
