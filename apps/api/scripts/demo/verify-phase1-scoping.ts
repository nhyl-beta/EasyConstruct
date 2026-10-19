import { assertDemoEnvironment } from "./demo-guard.js";
assertDemoEnvironment();

// apps/api/scripts/demo/verify-phase1-scoping.ts
//
// Live proof (API must be running) that project scoping now applies to
// workflows, approvals, reports, requirements, tasks, milestones and issues:
// a staffed engineer sees only staffed projects, a PM only their own, admin all.
// Run: npx tsx scripts/demo/verify-phase1-scoping.ts
import "dotenv/config";
import { api, login, raw, EMAILS } from "./demo-seed-lib.js";

let failed = 0;
const out: Record<string, unknown>[] = [];
const rec = (name: string, got: unknown, expected: unknown) => {
  const ok = String(got) === String(expected);
  if (!ok) failed += 1;
  out.push({ check: name, got, expected, result: ok ? "PASS" : "FAIL" });
};
const codesOf = (rows: any[], pick: (r: any) => string) => [...new Set(rows.map(pick))].sort().join(",");

async function main() {
  const [admin, eng, pm, pm1, hr, fin, cons] = await Promise.all([
    login(EMAILS.admin), login(EMAILS.engineer), login(EMAILS.pm), login(EMAILS.pm1), login(EMAILS.hr), login(EMAILS.finance), login(EMAILS.consultant),
  ]);
  const all = await api<{ id: number; code: string }[]>("/projects", admin);
  const idOf = (c: string) => all.find((p) => p.code === c)!.id;
  const demo = (rows: any[], pick: (r: any) => string) => codesOf(rows.filter((r) => /^DEMO-S\d$/.test(pick(r))), pick).replace(/DEMO-/g, "");

  // engineer@ is staffed on S2..S5
  const lists: [string, string, (r: any) => string][] = [
    ["engineering reports", "/engineering-reports", (r) => r.project],
    ["requirements", "/requirements", (r) => r.project],
    ["tasks", "/tasks", (r) => r.projectCode],
    ["milestones", "/milestones", (r) => r.projectCode],
    ["issues", "/issues", (r) => r.projectCode],
    ["workflows", "/workflows", (r) => r.projectCode],
    ["approval queue (pending)", "/workflows/approvals", (r) => r.projectCode],
  ];
  for (const [label, path, pick] of lists) {
    const rows = (await raw(path, eng)).data ?? [];
    const seen = demo(rows, pick);
    const bad = seen.split(",").filter((c) => c && !["S2", "S3", "S4", "S5"].includes(c));
    rec(`engineer@ ${label}: only staffed projects (S2-S5)`, bad.length === 0 ? "ok" : `leaks ${bad.join(",")}`, "ok");
  }
  // pm@ owns S1..S5; pm1 owns S6,S7
  for (const [label, path, pick] of lists) {
    const rows = (await raw(path, pm)).data ?? [];
    const seen = demo(rows, pick).split(",").filter(Boolean);
    rec(`pm@ ${label}: never S6/S7 (pm1's projects)`, seen.some((c) => c === "S6" || c === "S7") ? "leaks" : "ok", "ok");
    const rows1 = (await raw(path, pm1)).data ?? [];
    const seen1 = demo(rows1, pick).split(",").filter(Boolean);
    rec(`pm1 ${label}: only S6/S7`, seen1.every((c) => c === "S6" || c === "S7") ? "ok" : `leaks ${seen1.join(",")}`, "ok");
  }
  // admin sees everything, including S1 and S6/S7
  const adminWf = (await raw("/workflows", admin)).data ?? [];
  rec("admin workflows include S1 (unrestricted)", demo(adminWf, (r) => r.projectCode).includes("S1"), true);
  const adminTasks = (await raw("/tasks", admin)).data ?? [];
  rec("admin tasks include S4..S7", ["S4", "S5", "S6", "S7"].every((c) => demo(adminTasks, (r) => r.projectCode).includes(c)), true);
  // HR / Finance keep org-wide approval queues & workflow lists
  rec("HR still sees workflows from several projects", demo((await raw("/workflows", hr)).data ?? [], (r) => r.projectCode).split(",").length > 2, true);
  rec("finance still sees the budget-change requests", ((await raw("/workflows/budget-change-requests", fin)).data ?? []).length > 0, true);

  // By-id and write access to a project the caller cannot see
  const s1Wf = adminWf.find((w: any) => w.projectCode === "DEMO-S1" && w.stages?.some((s: any) => s.status === "current"));
  rec("engineer@ GET workflow on DEMO-S1 (not staffed) -> 403", (await raw(`/workflows/${s1Wf.id}`, eng)).status, 403);
  const stage = s1Wf.stages.find((s: any) => s.status === "current");
  rec("engineer@ decide stage on DEMO-S1 workflow -> 403", (await raw(`/workflows/${s1Wf.id}/stages/${stage.id}/decision`, eng, { method: "PATCH", body: { decision: "approve" } })).status, 403);
  rec("engineer@ attach to DEMO-S1 workflow -> 403", (await raw(`/workflows/${s1Wf.id}/attachments`, eng, { method: "POST", body: { label: "x", content: "y" } })).status, 403);
  const s6Wf = adminWf.find((w: any) => w.projectCode === "DEMO-S6");
  rec("pm@ GET workflow on DEMO-S6 (pm1's) -> 403", s6Wf ? (await raw(`/workflows/${s6Wf.id}`, pm)).status : "n/a (no S6 workflow)", s6Wf ? 403 : "n/a (no S6 workflow)");
  const s1Task = (await raw("/tasks?projectCode=DEMO-S4", admin)).data?.[0];
  rec("consultant@ GET task of DEMO-S5 -> 403", await (async () => {
    const t = ((await raw("/tasks?projectCode=DEMO-S5", admin)).data ?? [])[0];
    return (await raw(`/tasks/${t.id}`, cons)).status;
  })(), 403);
  void s1Task; void idOf;

  console.table(out);
  console.log(failed === 0 ? "ALL PHASE 1 SCOPING CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 250));
