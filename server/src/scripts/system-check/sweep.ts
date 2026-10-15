// server/src/scripts/system-check/sweep.ts
//
// Whole-system API sweep. For EVERY route in the live Express app (inventory.json,
// built by inventory.ts) and EVERY role it:
//   * GET routes      -> real ids resolved from the seeded data; records status per role
//   * mutating routes -> unauthenticated probe, then {} / junk-typed body, aimed at a
//                        NON-EXISTENT id when the path has one, so no real record is changed
//   * checks          -> no 5xx anywhere, no unauthenticated 2xx, bad ids give 4xx not 5xx
// Output: sweep-results.json (every request) + sweep-report.md (findings and role matrix).
//
// Safe by construction: refuses any base URL that is not the local demo API (demo-guard).
// Run:  SMOKE_BASE_URL=http://localhost:8123/api npx tsx src/scripts/system-check/sweep.ts <inventory.json> <outDir>
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { assertDemoApi, assertNoRealBlobStore, failIfLoginsFailed } from "../demo-guard.js";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8123/api";
assertDemoApi(BASE);
const [invPath = "inventory.json", outDir = "."] = process.argv.slice(2);

const PASSWORD = "Demo@12345";
const ROLE_ACCOUNTS: Record<string, string> = {
  owner: process.env.OWNER_EMAIL ?? "nhylcyrusgervasio@gmail.com",
  admin: "admin@easyconstruct.demo",
  "it-designer": "itdesigner@easyconstruct.demo",
  "project-manager": "pm@easyconstruct.demo",
  hr: "hr@easyconstruct.demo",
  finance: "finance@easyconstruct.demo",
  architect: "architect@easyconstruct.demo",
  engineer: "engineer@easyconstruct.demo",
  site: "site@easyconstruct.demo",
  consultant: "consultant@easyconstruct.demo",
};
const ROLES = Object.keys(ROLE_ACCOUNTS);
const GHOST_ID = "987654321";

type Probe = { method: string; route: string; url: string; role: string; kind: string; status: number; ms: number; note?: string };
const results: Probe[] = [];

async function send(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; json: any; ms: number }> {
  const t0 = Date.now();
  // A server-sent-events route never ends. Read only its status, then hang up: waiting for it made
  // every role's probe take the full 30 s timeout and was reported as a "slow response".
  if (path.split("?")[0]!.endsWith("/notifications/stream")) {
    const ctl = new AbortController();
    try {
      const res = await fetch(`${BASE}${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctl.signal });
      ctl.abort();
      return { status: res.status, json: null, ms: Date.now() - t0 };
    } catch (e) {
      return { status: 0, json: { error: String(e) }, ms: Date.now() - t0 };
    }
  }
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, json: { error: String(e) }, ms: Date.now() - t0 };
  }
}

const unwrap = (j: any): any[] => {
  const d = j?.data ?? j;
  if (Array.isArray(d)) return d;
  for (const k of ["items", "rows", "data", "records", "results"]) if (Array.isArray(d?.[k])) return d[k];
  return [];
};

async function main() {
  const inventory: { method: string; path: string }[] = JSON.parse(readFileSync(invPath, "utf8"));
  console.log(`Routes in inventory: ${inventory.length}`);

  // 1. sign in every role once
  const tokens: Record<string, string> = {};
  const failedLogins: string[] = [];
  for (const role of ROLES) {
    const r = await send("POST", "/auth/login", undefined, { email: ROLE_ACCOUNTS[role], password: PASSWORD });
    if (r.status !== 200) { console.error(`  ✘ login ${role} (${ROLE_ACCOUNTS[role]}) -> ${r.status}`); failedLogins.push(`${role} (${r.status})`); continue; }
    tokens[role] = r.json.data.token;
  }
  failIfLoginsFailed(failedLogins);
  await assertNoRealBlobStore(BASE, tokens.admin ?? Object.values(tokens)[0]!);
  const admin = tokens.admin ?? tokens["it-designer"];
  if (!admin) throw new Error("no admin token — cannot discover ids");

  // 2. discover real ids / codes per resource from the list endpoints (read with the widest-access role)
  const sample: Record<string, { id?: string; code?: string }> = {};
  const resources = [...new Set(inventory.map((r) => r.path.split("/")[2]).filter((x): x is string => !!x))];
  for (const res of resources) {
    for (const role of [ "admin", "project-manager", "it-designer", "hr", "finance", "owner" ]) {
      if (!tokens[role]) continue;
      const r = await send("GET", `/${res}`, tokens[role]);
      const rows = r.status === 200 ? unwrap(r.json) : [];
      if (rows.length) {
        const row = rows[0];
        sample[res] = { id: String(row.id ?? row.code ?? row.employeeId ?? ""), code: String(row.code ?? row.projectCode ?? row.project_code ?? row.id ?? "") };
        break;
      }
    }
  }
  const projectSample = sample["projects"] ?? { id: "1", code: "DEMO-S4" };

  const fill = (path: string, ghost: boolean): string =>
    path.replace(/:([A-Za-z0-9_]+)\??/g, (_m, name: string) => {
      if (ghost) return GHOST_ID;
      const res = path.split("/")[2] ?? "";
      if (/project.*code|^code$/i.test(name)) return encodeURIComponent(projectSample.code ?? "DEMO-S4");
      if (/project/i.test(name)) return projectSample.id ?? "1";
      const s = sample[res];
      return encodeURIComponent((/code/i.test(name) ? s?.code : s?.id) || "1");
    });

  const record = (p: Probe) => results.push(p);

  // 3. GET routes: every role + unauthenticated
  const gets = inventory.filter((r) => r.method === "GET");
  for (const r of gets) {
    const url = "/" + fill(r.path, false).replace(/^\/api\//, "");
    const un = await send("GET", url);
    record({ method: "GET", route: r.path, url, role: "(none)", kind: "unauth", status: un.status, ms: un.ms });
    for (const role of ROLES) {
      if (!tokens[role]) continue;
      const x = await send("GET", url, tokens[role]);
      record({ method: "GET", route: r.path, url, role, kind: "read", status: x.status, ms: x.ms });
    }
    // malformed id on :id routes must be a 4xx, never a 500
    if (/:[A-Za-z]*id\b/i.test(r.path)) {
      const bad = "/" + r.path.replace(/:[A-Za-z0-9_]*[iI]d\b/g, "not-a-number").replace(/:([A-Za-z0-9_]+)/g, "1").replace(/^\/api\//, "");
      const x = await send("GET", bad, admin);
      record({ method: "GET", route: r.path, url: bad, role: "admin", kind: "bad-id", status: x.status, ms: x.ms });
    }
  }

  // 4. mutating routes
  const muts = inventory.filter((r) => r.method !== "GET");
  const junk = { id: null, name: 12345, title: { a: 1 }, amount: "NaN", date: "not-a-date", items: "x", email: 5 };
  for (const r of muts) {
    const ghostUrl = "/" + fill(r.path, true).replace(/^\/api\//, "");
    const un = await send(r.method, ghostUrl, undefined, {});
    record({ method: r.method, route: r.path, url: ghostUrl, role: "(none)", kind: "unauth", status: un.status, ms: un.ms });
    // sign-in / recovery routes are rate limited and public by design: one unauthenticated probe is enough
    if (/^\/api\/auth\//.test(r.path)) continue;
    for (const role of ROLES) {
      if (!tokens[role]) continue;
      const e = await send(r.method, ghostUrl, tokens[role], {});
      record({ method: r.method, route: r.path, url: ghostUrl, role, kind: "empty-body", status: e.status, ms: e.ms, note: e.status >= 200 && e.status < 300 ? "accepted empty body" : undefined });
      const j = await send(r.method, ghostUrl, tokens[role], junk);
      record({ method: r.method, route: r.path, url: ghostUrl, role, kind: "junk-body", status: j.status, ms: j.ms });
    }
  }

  // 5. findings
  const PUBLIC = [/^\/api\/auth\/(login|forgot|reset|recover|owner)/i, /\/api\/cron\//];
  const findings: string[] = [];
  const by = (k: string) => results.filter((p) => p.kind === k);
  const fivexx = results.filter((p) => p.status >= 500 || p.status === 0);
  const unauthOpen = by("unauth").filter((p) => p.status >= 200 && p.status < 300 && !PUBLIC.some((re) => re.test(p.route)));
  const emptyAccepted = by("empty-body").filter((p) => p.status >= 200 && p.status < 300);
  const badIdServer = by("bad-id").filter((p) => p.status >= 500 || p.status === 200);
  const slow = results.filter((p) => p.ms > 3000);

  const md: string[] = [];
  md.push(`# System sweep report`, ``, `Base: ${BASE} · routes: ${inventory.length} · requests: ${results.length} · roles: ${ROLES.length}`, ``);
  md.push(`| Check | Count |`, `|---|---|`, `| Server errors (5xx / no response) | ${fivexx.length} |`, `| Unauthenticated 2xx on non-public route | ${unauthOpen.length} |`, `| Malformed id returned 5xx or 200 | ${badIdServer.length} |`, `| Mutation accepted an EMPTY body (2xx) | ${emptyAccepted.length} |`, `| Slow responses (>3s) | ${slow.length} |`, ``);
  const section = (title: string, rows: Probe[], limit = 60) => {
    md.push(`## ${title}`, ``);
    if (!rows.length) { md.push("None.", ""); return; }
    const seen = new Set<string>();
    let n = 0;
    for (const p of rows) {
      const key = `${p.method} ${p.route} ${p.status} ${p.kind}`;
      if (seen.has(key)) continue; seen.add(key);
      if (n++ >= limit) { md.push(`…and more (see sweep-results.json)`); break; }
      md.push(`- \`${p.method} ${p.route}\` → ${p.status} (${p.kind}, as ${p.role}${p.note ? `, ${p.note}` : ""})`);
    }
    md.push("");
  };
  section("Server errors", fivexx);
  section("Unauthenticated access that returned 2xx", unauthOpen);
  section("Malformed id not rejected cleanly", badIdServer);
  section("Mutations that accepted an empty body", emptyAccepted, 40);
  section("Slow responses", slow, 20);

  // role matrix: per top-level module, per role: share of GET routes that answered 2xx
  md.push(`## Role access matrix (GET routes answering 2xx / total, per module)`, ``);
  md.push(`| Module | ${ROLES.join(" | ")} |`, `|---|${ROLES.map(() => "---").join("|")}|`);
  const modules = [...new Set(gets.map((g) => g.path.split("/")[2]))];
  for (const mod of modules) {
    const routes = gets.filter((g) => g.path.split("/")[2] === mod).map((g) => g.path);
    const cells = ROLES.map((role) => {
      const ok = routes.filter((rt) => results.some((p) => p.kind === "read" && p.route === rt && p.role === role && p.status >= 200 && p.status < 300)).length;
      return `${ok}/${routes.length}`;
    });
    md.push(`| ${mod} | ${cells.join(" | ")} |`);
  }
  md.push("");

  writeFileSync(`${outDir}/sweep-results.json`, JSON.stringify({ sample, results }, null, 1));
  writeFileSync(`${outDir}/sweep-report.md`, md.join("\n"));
  console.log(md.slice(0, 12).join("\n"));
  console.log(`\nFull report: ${outDir}/sweep-report.md`);
}
main().catch((e) => { console.error(e); process.exit(1); });
