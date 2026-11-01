// qa:reset — rebuild the QA database to a known state. Runs only through the guard, only against QA_DATABASE_URL.
//   1. drop + recreate the public/drizzle schemas, 2. db:bootstrap (schema + reference data + migration journal), 3. seed accounts/employees/document types,
//   4. start a throwaway API on the QA port, 5. build the demo projects through the real API,
//   6. rename DEMO-S1..S7 to DEMO-STAGE-0..6, 7. verify what exists and report.
import { spawn, type ChildProcess } from "node:child_process";
import pg from "pg";
import { assertQaEnvironment, assertResetAllowed, GuardError, type QaConfig } from "../guard.js";
import { ROLES } from "../roles.js";
import { API_DIR, apiPort, qaChildEnv } from "./env.js";
import { startStandIn } from "./estimationpro-standin.js";

const STAGES: { code: string; phase: string; pct: number }[] = [
  { code: "DEMO-STAGE-0", phase: "Proposal", pct: 8 }, { code: "DEMO-STAGE-1", phase: "Design", pct: 25 },
  { code: "DEMO-STAGE-2", phase: "Pre-Construction", pct: 29 }, { code: "DEMO-STAGE-3", phase: "Construction", pct: 59 },
  { code: "DEMO-STAGE-4", phase: "Closeout", pct: 99 }, { code: "DEMO-STAGE-5", phase: "Completed", pct: 100 },
  { code: "DEMO-STAGE-6", phase: "Archived", pct: 100 },
];

function run(cfg: QaConfig, label: string, args: string[], optional = false, extraEnv: NodeJS.ProcessEnv = {}, cmd = "npm"): Promise<void> {
  console.log(`\n▶ ${label}`);
  // Async (not spawnSync) so the in-process price stand-in can answer while the child runs.
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmd === "npm" ? ["run", ...args] : args, { cwd: API_DIR, env: { ...qaChildEnv(cfg), ...extraEnv }, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) return resolve();
      if (optional) { console.warn(`⚠ ${label} failed (exit ${code}); continuing.`); return resolve(); }
      reject(new Error(`${label} failed (exit ${code})`));
    });
  });
}

async function waitForApi(cfg: QaConfig, child: ChildProcess) {
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null) throw new Error("API process exited during startup");
    try { if ((await fetch(`${cfg.apiUrl.replace(/\/$/, "")}/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("API did not become healthy within 90s");
}

async function main() {
  const cfg = assertQaEnvironment();
  assertResetAllowed(cfg);
  console.log(`QA reset target: ${cfg.dbHost}:${cfg.dbPort}/${cfg.dbName}`);

  const client = new pg.Client({ connectionString: cfg.databaseUrl });
  await client.connect();
  const who = (await client.query("select current_database() db, inet_server_addr()::text addr")).rows[0];
  if (who.db !== cfg.dbName) throw new Error(`Connected to ${who.db}, expected ${cfg.dbName}`);
  await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();
  console.log("✔ schemas dropped and recreated");

  await run(cfg, "bootstrap schema + reference data (empty database only)", ["db:bootstrap", "--", "--yes"]);
  await run(cfg, "seed accounts + employees + workflow templates", ["db:seed"]);

  // The seeders sign in as many accounts, and the API limits sign-ins (40 / 15 min / address). Each seeder is
  // idempotent and an API restart clears the limiter, so the chain (same order as `npm run demo:seed`) is run one
  // script at a time; when one stops, the API is restarted and only that script is retried.
  const chain = ["demo-seed-stages", "demo-seed-roles", "demo-seed-revisions", "demo-revisions", "demo-seed-requests", "demo-seed-design", "demo-seed-owner-payroll", "demo-seed-procurement"];
  await run(cfg, "demo employees roster", ["demo-employees"].map((x) => `scripts/demo/${x}.ts`).flatMap((f) => ["tsx", f]), false, {}, "npx");
  const standIn = await startStandIn(8124);
  let api: ChildProcess | null = null;
  const startApi = async () => {
    api = spawn("npx", ["tsx", "src/main.ts"], { cwd: API_DIR, env: { ...qaChildEnv(cfg), PORT: apiPort(cfg) }, stdio: ["ignore", "inherit", "inherit"], detached: true });
    await waitForApi(cfg, api);
  };
  const stopApi = async () => {
    if (api?.pid) { try { process.kill(-api.pid, "SIGTERM"); } catch { /* gone */ } }
    api = null;
    await new Promise((r) => setTimeout(r, 2000));
  };
  try {
    console.log(`\n▶ starting API on ${cfg.apiUrl}`);
    await startApi();
    await run(cfg, "reference prices (local stand-in)", ["ai:seed-references"], false, { ESTIMATIONPRO_BASE_URL: "http://127.0.0.1:8124/api/v1" });
    for (const script of chain) {
      for (let attempt = 1; ; attempt++) {
        try {
          await run(cfg, script, ["tsx", `scripts/demo/${script}.ts`], false, {}, "npx");
          break;
        } catch (e) {
          if (attempt >= 3) throw e;
          console.warn(`⚠ ${script} stopped; restarting the API (clears the sign-in limiter) and retrying it`);
          await stopApi();
          await startApi();
        }
      }
    }
  } finally {
    await stopApi();
    standIn.close();
  }

  const c2 = new pg.Client({ connectionString: cfg.databaseUrl });
  await c2.connect();
  for (let i = 1; i <= 7; i++) {
    await c2.query("UPDATE projects SET code = $1 WHERE code = $2", [`DEMO-STAGE-${i - 1}`, `DEMO-S${i}`]);
  }
  const have = await c2.query("SELECT code, status, progress FROM projects WHERE code LIKE 'DEMO-STAGE-%' ORDER BY code");
  console.log("\nDemo projects (documented vs actual):");
  const mismatches: string[] = [];
  for (const s of STAGES) {
    const row = have.rows.find((r) => r.code === s.code);
    const ok = row && row.status === s.phase && Math.round(Number(row.progress)) === s.pct;
    console.log(`  ${s.code.padEnd(14)} expected ${s.phase} ${s.pct}%   actual ${row ? `${row.status} ${row.progress}%` : "MISSING"}   ${ok ? "OK" : "DIFFERS"}`);
    if (!ok) mismatches.push(s.code);
  }
  const roleCounts = await c2.query("SELECT role, count(*)::int n FROM users GROUP BY role ORDER BY role");
  const emp = await c2.query("SELECT count(*)::int n FROM employees WHERE user_id IS NOT NULL");
  const docs = await c2.query("SELECT (SELECT count(*)::int FROM documents) docs, (SELECT count(*)::int FROM document_types) types");
  console.log("\nAccounts per role:", roleCounts.rows.map((r) => `${r.role}=${r.n}`).join(", "));
  console.log(`Employees linked to an account: ${emp.rows[0].n}; documents: ${docs.rows[0].docs}; document types: ${docs.rows[0].types}`);
  const missingRoles = ROLES.filter((r) => !roleCounts.rows.some((x) => x.role === r.backend));
  if (missingRoles.length) console.log("MISSING ROLES:", missingRoles.map((r) => r.label).join(", "));
  await c2.end();
  if (mismatches.length) console.log(`\n⚠ ${mismatches.length} demo project(s) differ from the documented state: ${mismatches.join(", ")} (recorded in the build log; not edited).`);
  console.log("\n✔ qa:reset finished");
}

main().catch((e) => {
  console.error(e instanceof GuardError ? e.message : e);
  process.exit(1);
});
