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
