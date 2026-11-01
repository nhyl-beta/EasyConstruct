// Runner used by the qa:* scripts: guard -> make sure the QA API (and web app, for UI suites) are up -> playwright.
// Servers this script starts are stopped afterwards. A server that is already running is used as is; the global
// setup then proves it serves the QA database by signing in as the QA-only Owner account.
import { spawn, type ChildProcess } from "node:child_process";
import { guardOrExit } from "./guard.js";
import { API_DIR, apiPort, qaChildEnv, REPO_ROOT } from "./reset/env.js";
import { join } from "node:path";

const cfg = guardOrExit();
const args = process.argv.slice(2);
const needsWeb = args.some((a) => /ui|crawl|smoke|functional|lifecycle/.test(a));
const started: ChildProcess[] = [];

const up = async (url: string) => { try { return (await fetch(url)).ok; } catch { return false; } };
async function waitFor(url: string, child: ChildProcess, label: string) {
  for (let i = 0; i < 120; i++) {
    if (await up(url)) return;
    if (child.exitCode !== null) throw new Error(`${label} exited during startup`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} did not start within 120s`);
}

async function main() {
  const health = `${cfg.apiUrl.replace(/\/$/, "")}/health`;
  if (!(await up(health))) {
    console.log(`Starting QA API on ${cfg.apiUrl} (database ${cfg.dbHost}/${cfg.dbName})`);
    const api = spawn("npx", ["tsx", "src/main.ts"], { cwd: API_DIR, env: { ...qaChildEnv(cfg), PORT: apiPort(cfg) }, stdio: ["ignore", "ignore", "inherit"], detached: true });
    started.push(api);
    await waitFor(health, api, "QA API");
  } else console.log(`Using the API already running at ${cfg.apiUrl}`);

  if (needsWeb && !(await up(cfg.baseUrl))) {
    console.log(`Starting web app on ${cfg.baseUrl}, pointed at the QA API`);
    const web = spawn("npx", ["vite", "--port", new URL(cfg.baseUrl).port || "5173", "--strictPort"], {
      cwd: join(REPO_ROOT, "apps", "web"),
      env: { PATH: process.env.PATH, HOME: process.env.HOME, VITE_API_URL: cfg.apiUrl, VITE_API_BASE: new URL(cfg.apiUrl).origin },
      stdio: ["ignore", "ignore", "inherit"], detached: true,
    });
    started.push(web);
    await waitFor(cfg.baseUrl, web, "web app");
  }

  const pw = spawn("npx", ["playwright", "test", ...args], { cwd: join(REPO_ROOT, "qa"), stdio: "inherit", env: { ...process.env, QA_CHROMIUM_PATH: process.env.QA_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" } });
  const code: number = await new Promise((r) => pw.on("exit", (c) => r(c ?? 1)));
  return code;
}

const stop = () => { for (const c of started) { try { process.kill(-c.pid!, "SIGTERM"); } catch { /* gone */ } } };
process.on("SIGINT", () => { stop(); process.exit(130); });
main().then((c) => { stop(); process.exit(c); }, (e) => { console.error(e); stop(); process.exit(1); });
