import { assertDemoEnvironment } from "./demo-guard.js";
assertDemoEnvironment();

// apps/api/scripts/demo/api-smoke-test.ts — NEW (L3)
//
// Boundary-case API tests (401/403/409) for the lifecycle system, run
// against a live dev server (`npm run dev` in another terminal) rather than
// mocked — the whole point is to exercise real auth/role/gate middleware,
// not a stub of it. Uses TEST_v22 as scratch, forcing its phase via direct
// SQL for setup and restoring it afterward, the same way every group's
// manual curl verification in docs/lifecycle-progress.md did.
//
// Run with: npx tsx scripts/demo/api-smoke-test.ts
import pg from "pg";
import "dotenv/config";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8000/api";
const PASSWORD = "Demo@12345";
const PROJECT_CODE = "TEST_v22";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

let passed = 0;
let failed = 0;

async function expect(name: string, actual: number, expected: number, body?: unknown) {
  if (actual === expected) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.error(`  ✘ ${name} — expected ${expected}, got ${actual}`, body ?? "");
  }
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json = (await res.json()) as { data?: { token?: string } };
  if (!res.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(json)}`);
  return json.data!.token as string;
}

async function call(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, json };
}

async function setProjectStatus(status: string) {
  await pool.query("UPDATE projects SET status = $1 WHERE code = $2", [status, PROJECT_CODE]);
}

async function getProjectStatus(): Promise<string> {
  const { rows } = await pool.query("SELECT status FROM projects WHERE code = $1", [PROJECT_CODE]);
  return rows[0]?.status;
}

async function main() {
  const originalStatus = await getProjectStatus();
  console.log(`Running smoke tests against ${BASE} (${PROJECT_CODE} currently "${originalStatus}")\n`);

  const [pm, engineer, site, finance, admin] = await Promise.all([
    login("pm@easyconstruct.demo"),
    login("engineer@easyconstruct.demo"),
    login("site@easyconstruct.demo"),
    login("finance@easyconstruct.demo"),
    login("admin@easyconstruct.demo"),
  ]);

  console.log("401 — unauthenticated:");
  {
    const r = await call("/projects");
    await expect("GET /projects with no token", r.status, 401, r.json);
  }

  console.log("\n403 — role/ownership boundaries:");
  {
    const r = await call(`/projects/2/lifecycle/advance`, { method: "POST", token: engineer, body: {} });
    await expect("engineer advancing a project → 403", r.status, 403, r.json);
  }
  {
    const r = await call(`/projects/2/lifecycle/archive`, { method: "POST", token: pm, body: {} });
    await expect("non-admin archiving a project → 403", r.status, 403, r.json);
  }
  {
    const r = await call("/workflows", {
      method: "POST",
      token: pm,
      body: { title: "smoke-closeout", projectCode: PROJECT_CODE, templateId: 10 },
    });
    // Rejected either for role (not engineer/admin) or phase (not Closeout
    // yet) — both are legitimate depending on current seed state, so this
    // only asserts it is NOT a 2xx success.
    await expect("PM starting a Project Closeout workflow → not 2xx", r.status >= 400 ? 1 : 0, 1, r.json);
  }

  console.log("\n400/409 — validation and gate boundaries:");
  await setProjectStatus("Proposal");
  {
    const r = await call("/attendance", {
      method: "POST",
      token: site,
      body: { employeeId: "EMP-DEMO-07", site: "Main", clockIn: "08:00", logDate: "2026-09-24", photoUrl: "http://x/y.jpg" },
    });
    await expect("attendance clock-in with no projectCode → 400", r.status, 400, r.json);
  }
  {
    const r = await call(`/projects/2/lifecycle/advance`, { method: "POST", token: pm, body: {} });
    await expect("advance blocked by failing gates → 409", r.status, 409, r.json);
  }
  {
    const r = await call(`/projects/2/lifecycle/advance`, {
      method: "POST",
      token: admin,
      body: { override: true, reason: "short" },
    });
    await expect("admin override with a too-short reason → 409", r.status, 409, r.json);
  }
  {
    const r = await call(`/projects/2/lifecycle/hold`, { method: "POST", token: pm, body: {} });
    await expect("hold with no reason → 409", r.status, 409, r.json);
  }
  await setProjectStatus("Construction");
  {
    const r = await call("/attendance", {
      method: "POST",
      token: site,
      body: {
        employeeId: "EMP-DEMO-47",
        site: "Main",
        projectCode: PROJECT_CODE,
        clockIn: "08:00",
        logDate: "2026-09-24",
        photoUrl: "http://x/y.jpg",
      },
    });
    // EMP-DEMO-47 (Site Personnel One) is not staffed on TEST_v22 — the
    // clocking-in *actor* is `site@` (Rico Domingo), who IS staffed, so this
    // exercises the *target employee's* staffing check, a 403 either way.
    await expect("clock-in for an unstaffed employee → 403", r.status, 403, r.json);
  }

  console.log("\n401 on the reads a bare-token check should also cover:");
  {
    const r = await call("/lifecycle/my-actions");
    await expect("GET /lifecycle/my-actions with no token → 401", r.status, 401, r.json);
  }
  {
    const r = await call("/notifications");
    await expect("GET /notifications with no token → 401", r.status, 401, r.json);
  }

  // Restore whatever phase the project was actually in before this run.
  await setProjectStatus(originalStatus);
  await pool.end();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
