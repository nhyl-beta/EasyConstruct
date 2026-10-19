// apps/api/src/scripts/demo-verify.ts
//
// Read-only evidence for the clean-slate task: account checksums, headline
// counts, per-project gate output, S7 write rejection, role x page data matrix,
// scoping proof (403/404 for unassigned projects), HR KPI reconciliation,
// orphan check and seeded-file downloads. Prints markdown-ish tables that are
// pasted into docs/demo-and-ux-progress.md.
//
// Run with: npm run demo:verify   (API running; DATABASE_URL set)
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { assertDemoApi, assertDemoDatabase } from "./demo-guard.js";
import { api, BASE, login, PASSWORD, raw, EMAILS } from "./demo-seed-lib.js";
import { DEMO_PROJECTS } from "./demo-projects.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;
const h = (t: string) => console.log(`\n## ${t}`);

const count = (d: any): number => {
  if (Array.isArray(d)) return d.length;
  if (d == null) return 0;
  for (const k of ["items", "rows", "data", "records", "employees", "batches"]) if (Array.isArray(d[k])) return d[k].length;
  if (typeof d.total === "number") return d.total;
  return Object.keys(d).length;
};

async function checksums() {
  h("1. Account checksums (users, password_reset_tokens, roles, employee<->user links)");
  const out: Record<string, string> = {};
  for (const t of ["users", "password_reset_tokens", "roles"]) {
    const r = (await q(`SELECT count(*)::int AS n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM "${t}" x`))[0];
    out[t] = `${r.n} rows md5=${r.h}`;
  }
  const l = (await q(`SELECT count(*)::int AS n, md5(coalesce(string_agg(id || ':' || employee_id || ':' || user_id, '|' ORDER BY id), '')) AS h FROM employees WHERE user_id IS NOT NULL`))[0];
  out["employee↔user links"] = `${l.n} rows md5=${l.h}`;
  const file = path.resolve(process.cwd(), "backups", "account-checksums-before.json");
  const before = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>) : null;
  console.table(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { now: v, before: before?.[k] ?? "(no file)", match: before ? before[k] === v : "n/a" }])));
}

async function headline() {
  h("2. Headline counts");
  console.table(await q(`SELECT (SELECT count(*) FROM projects)::int AS projects, (SELECT count(*) FROM employees)::int AS employees, (SELECT count(*) FROM users)::int AS users`));
  console.table(await q(`SELECT code, name, status, progress, to_char(completed_at,'YYYY-MM-DD') completed, to_char(archived_at,'YYYY-MM-DD') archived, contract_value::float FROM projects ORDER BY code`));
  console.table(await q(`SELECT status, count(*)::int FROM employees GROUP BY 1 ORDER BY 2 DESC`));
  console.table(await q(`SELECT department, count(*)::int FROM employees GROUP BY 1 ORDER BY 2 DESC`));
  console.table(await q(`SELECT site, count(*)::int FROM employees GROUP BY 1 ORDER BY 2 DESC`));
  console.table(await q(`SELECT employee_id, name, role, department, status FROM employees WHERE name ~ 'Villaflor|Dela Rosa|Yoldi|Gervasio'`));
}

async function gates(admin: string) {
  h("3. Gate checks per project (GET /projects/:id/lifecycle)");
  const projects = await api<{ id: number; code: string }[]>("/projects", admin);
  const rows = [] as Record<string, unknown>[];
  for (const p of DEMO_PROJECTS) {
    const id = projects.find((x) => x.code === p.code)!.id;
    const v = await api<any>(`/projects/${id}/lifecycle`, admin);
    rows.push({ code: p.code, phase: v.phase, progress: `${v.progress}%`, canAdvance: v.canAdvance, gates: v.checks.map((c: any) => `${c.key}:${c.passed ? "true" : "false"}`).join(" ") || "(terminal)" });
  }
  console.table(rows);
  return projects;
}

async function s7Rejection(projects: { id: number; code: string }[]) {
  h("4. DEMO-S7 write rejection (assertProjectWritable)");
  const pm1 = await login(EMAILS.pm1);
  const s7 = projects.find((p) => p.code === "DEMO-S7")!;
  const t = await raw("/tasks", pm1, { method: "POST", body: { taskCode: "TSK-S7-X", projectCode: "DEMO-S7", title: "Should be rejected" } });
  const m = await raw("/milestones", pm1, { method: "POST", body: { projectCode: "DEMO-S7", title: "Should be rejected" } });
  const p = await raw(`/projects/${s7.id}`, pm1, { method: "PATCH", body: { description: "edit attempt" } });
  console.table([
    { attempt: "POST /tasks", status: t.status, message: t.message },
    { attempt: "POST /milestones", status: m.status, message: m.message },
    { attempt: "PATCH /projects/:id", status: p.status, message: p.message },
  ]);
}

async function roleMatrix() {
  h("5. Role x sidebar page data matrix (row counts from the endpoint each page reads)");
  const candidates: Record<string, string[]> = {
    owner: [EMAILS.owner],
    admin: ["admin@easyconstruct.demo"],
    it_designer: ["itdesigner@easyconstruct.demo", "itdesigner1@easyconstruct.demo", "itdesigner2@easyconstruct.demo"],
    project_manager: ["pm@easyconstruct.demo"],
    human_resources: ["hr@easyconstruct.demo"],
    finance_manager: ["finance@easyconstruct.demo"],
    architect: ["architect@easyconstruct.demo"],
    engineer: ["engineer@easyconstruct.demo"],
    site_personnel: ["site@easyconstruct.demo"],
    consultant: ["consultant@easyconstruct.demo"],
  };
  const pages: Record<string, [string, string | null][]> = {
    owner: [["dashboard", "/projects"], ["owner-portfolio", "/projects"], ["owner-proposals", "/proposals"], ["owner-audit-trail", "/audit-logs"], ["owner-oversight", "/workflows"], ["owner-account-recovery", null], ["reports", "/engineering-reports"]],
    admin: [["dashboard", "/projects"], ["admin-projects", "/projects"], ["admin-workflows", "/workflows"], ["admin-documents", "/documents"], ["admin-activity-logs", "/audit-logs"], ["admin-security", "/audit-logs/security-overview"], ["admin-roles-permissions", "/roles"], ["admin-workflow-configuration", "/workflows/templates"], ["admin-approval-hierarchy", "/workflows/templates"], ["admin-support", null]],
    it_designer: [["dashboard", "/projects"], ["it-designer-users", "/users"], ["it-designer-proposals", "/proposals"], ["admin-projects", "/projects"], ["admin-workflows", "/workflows"], ["admin-documents", "/documents"], ["it-designer-roles-permissions", "/roles"], ["it-designer-activity-logs", "/audit-logs"], ["it-designer-security", "/audit-logs/security-overview"], ["it-designer-support", null]],
    project_manager: [["dashboard", "/projects"], ["projects", "/projects"], ["workflows", "/workflows"], ["approvals", "/workflows/approvals"], ["issues", "/issues"], ["tasks", "/tasks"], ["documents", "/documents"], ["reports", "/engineering-reports"]],
    human_resources: [["dashboard", "/workforce-reports/summary"], ["employees", "/employees"], ["attendance", "/attendance"], ["payroll", "/payroll/batches/all"], ["workforce-reports", "/workforce-reports/summary"], ["approvals", "/workflows/approvals"], ["reports", "/hr/reports/workforce"]],
    finance_manager: [["dashboard", "/finance/summary"], ["budget", "/finance/budgets"], ["payroll-review", "/payroll/batches/all"], ["expenses", "/finance/expenses"], ["approvals", "/workflows/approvals"], ["impact-review", "/workflows/budget-change-requests"], ["reports", "/finance/project-profitability"]],
    architect: [["dashboard", "/projects"], ["architect-projects", "/projects"], ["designs", "/designs"], ["proposals", "/proposals"], ["approvals", "/workflows/approvals"], ["revisions", "/revisions"], ["blueprints", "/blueprints"], ["architect-documents", "/architect-documents"]],
    engineer: [["dashboard", "/projects"], ["progress", "/tasks"], ["tasks", "/tasks"], ["requirements", "/requirements"], ["approvals", "/workflows/approvals"], ["issues", "/issues"], ["projects", "/projects"]],
    site_personnel: [["dashboard", "/tasks"], ["attendance", "/attendance"], ["tasks", "/tasks"], ["requirements", "/requirements"], ["documents", "/documents"], ["issues", "/issues"]],
    consultant: [["dashboard", "/projects"], ["consultant-proposals", "/proposals"], ["consultant-designs", "/designs"], ["consultant-design-reviews", "/design-reviews"], ["advisory-docs", "/documents"], ["consultant-projects", "/projects"], ["blueprint reviews", "/blueprints"]],
  };
  const rows: Record<string, unknown>[] = [];
  for (const [role, emails] of Object.entries(candidates)) {
    let token = "";
    let used = "";
    for (const e of emails) {
      try {
        token = await login(e);
        used = e;
        break;
      } catch {
        /* try next */
      }
    }
    if (!token) {
      rows.push({ role, page: "(login)", rows: "-", populated: `FAIL: none of ${emails.join(", ")} could sign in` });
      continue;
    }
    for (const [page, ep] of pages[role]!) {
      if (!ep) {
        rows.push({ role, account: used, page, endpoint: "(no table/endpoint)", rows: "-", populated: "n/a" });
        continue;
      }
      const r = await raw(ep, token);
      const n = r.status === 200 ? count(r.data) : -1;
      rows.push({ role, account: used, page, endpoint: ep, rows: r.status === 200 ? n : `HTTP ${r.status}`, populated: r.status === 200 && n > 0 ? "PASS" : "FAIL" });
    }
  }
  console.table(rows);
}

async function scoping() {
  h("6. Scoping proof (per-role project lists + cross-project access)");
  const admin = await login(EMAILS.admin);
  const all = await api<{ id: number; code: string }[]>("/projects", admin);
  const idOf = (c: string) => all.find((p) => p.code === c)!.id;
  const rows: Record<string, unknown>[] = [];
  for (const [role, email, foreign] of [
    ["architect", EMAILS.architect, "DEMO-S5"],
    ["consultant", EMAILS.consultant, "DEMO-S5"],
    ["engineer", EMAILS.engineer, "DEMO-S1"],
    ["project-manager (pm)", EMAILS.pm, "DEMO-S6"],
    ["project-manager (pm1)", EMAILS.pm1, "DEMO-S2"],
    ["site-personnel", EMAILS.site, "DEMO-S1"],
  ] as const) {
    const t = await login(email);
    const list = await api<{ code: string }[]>("/projects", t);
    const direct = await raw(`/projects/${idOf(foreign)}`, t);
    const lc = await raw(`/projects/${idOf(foreign)}/lifecycle`, t);
    const designs = await raw(`/designs?projectCode=${foreign}`, t);
    rows.push({
      role,
      sees: list.map((p) => p.code.replace("DEMO-", "")).filter((c) => /^S\d$/.test(c)).sort().join(","),
      foreign,
      "GET /projects/:id": direct.status,
      "GET /lifecycle": lc.status,
      "designs for foreign project": designs.status === 200 ? `${count(designs.data)} rows` : designs.status,
    });
  }
  console.table(rows);
}

async function hrKpis() {
  h("7. HR / workforce KPIs vs independent SQL");
  const hr = await login(EMAILS.hr);
  const sum = await raw("/workforce-reports/summary", hr);
  console.log("API /workforce-reports/summary:", JSON.stringify(sum.data).slice(0, 700));
  console.table(await q(`SELECT count(*)::int total, count(*) FILTER (WHERE status='Active')::int active, count(*) FILTER (WHERE status='On Leave')::int on_leave, count(*) FILTER (WHERE status='Inactive')::int inactive, count(*) FILTER (WHERE status='Archived')::int archived FROM employees`));
  console.table(await q(`SELECT count(*)::int attendance_rows, count(*) FILTER (WHERE attendance_status='Present')::int present, count(*) FILTER (WHERE attendance_status='Late')::int late, count(*) FILTER (WHERE attendance_status='Absent')::int absent, count(*) FILTER (WHERE attendance_status='Half Day')::int half_day, count(*) FILTER (WHERE geofence='Outside')::int outside, count(DISTINCT log_date)::int days FROM attendance`));
  console.table(await q(`SELECT status, count(*)::int, sum(net)::float AS net_total FROM payroll_batches b LEFT JOIN LATERAL (SELECT sum(net) net FROM payroll p WHERE p.batch_id = b.id) x ON true GROUP BY 1`).catch(() => []));
}

async function orphans() {
  h("8. Orphan check (project-code references that no longer match a project)");
  const checks: [string, string][] = [
    ["tasks", "project_code"], ["milestones", "project_code"], ["issues", "project_code"], ["requirements", "project"], ["documents", "project"],
    ["engineering_reports", "project"], ["designs", "project_code"], ["blueprints", "project_code"], ["proposals", "project_code"], ["budgets", "project"],
    ["expenses", "project"], ["workflows", "project_code"], ["attendance", "project_code"], ["payroll_batches", "project_code"], ["project_members", "project_code"],
    ["project_phase_history", "project_code"], ["notifications", "project_code"], ["revisions", "project_code"],
  ];
  const rows = [];
  for (const [t, c] of checks) {
    const r = (await q(`SELECT count(*)::int n FROM "${t}" x WHERE x."${c}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.code = x."${c}")`))[0];
    rows.push({ table: t, column: c, orphans: r.n });
  }
  console.table(rows);
}

async function files() {
  h("9. Seeded file downloads (GET /api/uploads/file)");
  const admin = await login(EMAILS.admin);
  const pick = async (label: string, sql: string, role: string) => {
    const r = (await q(sql))[0];
    const url = r?.u as string | undefined;
    if (!url) return { label, result: "no record" };
    const token = await login(role);
    const res = await fetch(`${BASE}/uploads/file?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${token}` } });
    const buf = Buffer.from(await res.arrayBuffer());
    return { label, status: res.status, type: res.headers.get("content-type"), bytes: buf.length, magic: buf.subarray(0, 4).toString("latin1").replace(/[^\x20-\x7e]/g, "."), url: url.slice(0, 60) };
  };
  const rows = [
    await pick("Architect design file", `SELECT file_urls->0->>'url' u FROM designs WHERE project_code='DEMO-S4' LIMIT 1`, EMAILS.architect),
    await pick("Consultant advisory upload", `SELECT file_url u FROM documents WHERE document_id LIKE 'A-S%' ORDER BY id LIMIT 1`, EMAILS.consultant),
    await pick("Site attendance photo", `SELECT a.photo_url u FROM attendance a JOIN employees e ON e.employee_id = a.employee_id JOIN users x ON x.id = e.user_id WHERE x.email = '${EMAILS.site}' ORDER BY a.id LIMIT 1`, EMAILS.hr),
    await pick("Finance expense receipt", `SELECT receipt_url u FROM expenses WHERE receipt_url IS NOT NULL ORDER BY id LIMIT 1`, EMAILS.finance),
    await pick("Site field document", `SELECT file_url u FROM documents WHERE document_id LIKE 'F-S4-%' ORDER BY id LIMIT 1`, EMAILS.site),
    await pick("Engineer requirement attachment", `SELECT attachments->0->>'url' u FROM requirements WHERE project='DEMO-S4' ORDER BY id LIMIT 1`, EMAILS.engineer),
    await pick("Proposal attachment (workflow)", `SELECT file_url u FROM workflow_attachments WHERE file_url IS NOT NULL ORDER BY id LIMIT 1`, EMAILS.consultant),
  ];
  console.table(rows);
  void admin;
}

async function dead() {
  h("10. Every stored file URL resolves (all seeded file references)");
  const refs = await q(`
    SELECT 'documents' src, file_url u FROM documents WHERE file_url IS NOT NULL
    UNION ALL SELECT 'designs', jsonb_array_elements(file_urls)->>'url' FROM designs
    UNION ALL SELECT 'requirements', jsonb_array_elements(attachments)->>'url' FROM requirements
    UNION ALL SELECT 'attendance', photo_url FROM attendance WHERE photo_url IS NOT NULL
    UNION ALL SELECT 'expenses', receipt_url FROM expenses WHERE receipt_url IS NOT NULL
    UNION ALL SELECT 'issues', attachment_url FROM issues WHERE attachment_url IS NOT NULL
    UNION ALL SELECT 'workflow_attachments', file_url FROM workflow_attachments WHERE file_url IS NOT NULL
    UNION ALL SELECT 'tasks', completion_file_url FROM tasks WHERE completion_file_url IS NOT NULL`);
  const unique = new Map<string, string>();
  for (const r of refs) unique.set(r.u as string, r.src as string);
  const token = await login(EMAILS.admin);
  const bad: string[] = [];
  let ok = 0;
  const entries = [...unique.entries()];
  for (let i = 0; i < entries.length; i += 8) {
    await Promise.all(
      entries.slice(i, i + 8).map(async ([u, src]) => {
        const res = await fetch(`${BASE}/uploads/file?url=${encodeURIComponent(u)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 200) ok += 1;
        else bad.push(`${src}: ${u} -> ${res.status}`);
      }),
    );
  }
  console.log(`${unique.size} distinct file URLs referenced; ${ok} download OK; ${bad.length} failing`);
  for (const b of bad.slice(0, 20)) console.log("  ✘", b);
}

async function main() {
  assertDemoDatabase();
  assertDemoApi(BASE);
  const admin = await login(EMAILS.admin);
  void PASSWORD;
  await checksums();
  await headline();
  const projects = await gates(admin);
  await s7Rejection(projects);
  await roleMatrix();
  await scoping();
  await hrKpis();
  await orphans();
  await files();
  await dead();
}

main()
  .catch((e) => {
    console.error("verify failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    setTimeout(() => process.exit(process.exitCode ?? 0), 250);
  });
