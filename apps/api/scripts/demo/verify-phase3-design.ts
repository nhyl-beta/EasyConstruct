import { assertDemoEnvironment } from "./demo-guard.js";
assertDemoEnvironment();

// apps/api/scripts/demo/verify-phase3-design.ts
//
// Live API proof for the Design delivery type: creation rules, plan sets,
// lifecycle path/labels/progress, permissions, template guards, scoping, and
// that Construction projects are unchanged. Creates one throwaway project
// (code VERIFY-D2) and removes it again. Needs the API running.
import "dotenv/config";
import pg from "pg";
import { api, login, raw, EMAILS, TODAY } from "./demo-seed-lib.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
let failed = 0;
const out: Record<string, unknown>[] = [];
const rec = (name: string, got: unknown, expected: unknown) => {
  const ok = String(got) === String(expected);
  if (!ok) failed += 1;
  out.push({ check: name, got, expected, result: ok ? "PASS" : "FAIL" });
};

async function main() {
  const [admin, pm, pm1, arch, cons, eng, eng1] = await Promise.all([
    login(EMAILS.admin), login(EMAILS.pm), login(EMAILS.pm1), login(EMAILS.architect), login(EMAILS.consultant), login(EMAILS.engineer), login(EMAILS.engineer1),
  ]);
  const projects = await api<{ id: number; code: string; deliveryType: string }[]>("/projects", admin);
  const d1 = projects.find((p) => p.code === "DEMO-D1")!;
  const s4 = projects.find((p) => p.code === "DEMO-S4")!;
  const s5 = projects.find((p) => p.code === "DEMO-S5")!;

  // Creation rules
  const base = { name: "VERIFY design project", code: "VERIFY-D2", pm: "Miguel Santos", plannedStartDate: TODAY, due: "2027-06-30", client: "Verify Client", projectType: "Commercial", location: "Manila" };
  rec("Design project without a discipline -> 400", (await raw("/projects", pm, { method: "POST", body: { ...base, deliveryType: "Design" } })).status, 400);
  rec("unknown discipline -> 400", (await raw("/projects", pm, { method: "POST", body: { ...base, deliveryType: "Design", designDisciplines: ["Landscape"] } })).status, 400);
  const mk = await raw("/projects", pm, { method: "POST", body: { ...base, deliveryType: "Design", designDisciplines: ["Architectural", "Civil"] } });
  rec("Design project with disciplines -> 201", mk.status, 201);
  rec("delivery type stored", mk.data?.deliveryType, "Design");
  const v = mk.data.id as number;
  const patched = await raw(`/projects/${v}`, pm, { method: "PATCH", body: { deliveryType: "Construction" } });
  rec("delivery type cannot be changed afterwards", (await api<any>(`/projects/${v}`, pm)).deliveryType, "Design");
  void patched;
  const plain = await raw("/projects", pm, { method: "POST", body: { ...base, code: "VERIFY-C2", name: "VERIFY construction" } });
  rec("a project with no delivery type is Construction", plain.data?.deliveryType, "Construction");

  // Path + labels
  const lc0 = await api<any>(`/projects/${v}/lifecycle`, pm);
  rec("Design lifecycle path (no Pre-Construction/Construction)", lc0.phasePath.map((p: any) => `${p.phase}`).join(">"), "Proposal>Design>Closeout>Completed>Archived");
  rec("Closeout is labelled Turnover", lc0.phasePath.find((p: any) => p.phase === "Closeout").label, "Turnover");
  rec("Proposal gates are P1-P5", lc0.checks.map((c: any) => c.key).join(","), "P1,P2,P3,P4,P5");
  const lc4 = await api<any>(`/projects/${s4.id}/lifecycle`, pm);
  rec("Construction path unchanged: S4 gates K1-K4", lc4.checks.map((c: any) => c.key).join(","), "K1,K2,K3,K4");
  rec("Construction path unchanged: S4 progress still 61%", lc4.progress, 61);
  rec("Construction phasePath still 7 phases", lc4.phasePath.length, 7);
  const lc5 = await api<any>(`/projects/${s5.id}/lifecycle`, pm);
  rec("Closeout gates X1-X5 on the Construction project", lc5.checks.map((c: any) => c.key).join(","), "X1,X2,X3,X4,X5");

  // DEMO-D1
  const lcD = await api<any>(`/projects/${d1.id}/lifecycle`, pm);
  rec("DEMO-D1 is in Design with its own gate set", `${lcD.phase}:${lcD.checks.map((c: any) => c.key).join(",")}`, "Design:DP1,DP2,D2,D3,D4");
  rec("DEMO-D1 next phase is Closeout (Turnover)", lcD.nextPhase, "Closeout");
  const sets = await api<any[]>(`/deliverables?projectCode=DEMO-D1`, pm);
  const avg = sets.reduce((a, x) => a + x.points, 0) / sets.length;
  rec("plan-set progress math: 10 + 80 x average points", lcD.progress, Math.round(10 + 80 * (avg / 100)));
  rec("plan sets link their designs and open requests", sets.some((x) => x.designs.length > 0) && sets.some((x) => x.openRequests.length > 0), true);

  // Plan-set permissions + scoping
  const arc = sets.find((x) => x.discipline === "Architectural");
  rec("engineer cannot change a plan set -> 403", (await raw(`/deliverables/${arc.id}`, eng, { method: "PATCH", body: { status: "approved" } })).status, 403);
  rec("architect cannot approve a plan set -> 403", (await raw(`/deliverables/${arc.id}`, arch, { method: "PATCH", body: { status: "approved" } })).status, 403);
  rec("consultant can approve a plan set -> 200", (await raw(`/deliverables/${arc.id}`, cons, { method: "PATCH", body: { status: "approved" } })).status, 200);
  const after = await api<any>(`/projects/${d1.id}/lifecycle`, pm);
  rec("progress follows the plan-set status", after.progress > lcD.progress, true);
  await raw(`/deliverables/${arc.id}`, pm, { method: "PATCH", body: { status: "for_review" } }); // restore
  rec("lead must be a staffed architect (engineer as lead -> 400)", (await raw(`/deliverables/${arc.id}`, pm, { method: "PATCH", body: { leadUserId: (await api<any[]>("/users", admin)).find((u) => u.email === EMAILS.engineer)!.id } })).status, 400);
  rec("engineer1 (not staffed) cannot list DEMO-D1 plan sets -> 403", (await raw(`/deliverables?projectCode=DEMO-D1`, eng1)).status, 403);
  rec("pm1 (another PM) cannot list them -> 403", (await raw(`/deliverables?projectCode=DEMO-D1`, pm1)).status, 403);
  rec("plan sets exist only on Design projects: S4 -> 409", (await raw(`/deliverables`, pm, { method: "POST", body: { projectCode: "DEMO-S4", discipline: "Civil" } })).status, 409);

  // Template guards
  const templates = await api<{ id: number; name: string }[]>("/workflows/templates", admin);
  const turnover = templates.find((t) => t.name === "Design Turnover")!;
  const closeout = templates.find((t) => t.name === "Project Closeout")!;
  rec("Design Turnover exists (Architect > Consultant > PM > Admin)", turnover ? "yes" : "no", "yes");
  rec("Design Turnover on a Construction project -> 409", (await raw("/workflows", arch, { method: "POST", body: { title: "VERIFY turnover on S4", projectCode: "DEMO-S4", templateId: turnover.id } })).status, 409);
  rec("Design Turnover before Turnover phase -> 409", (await raw("/workflows", arch, { method: "POST", body: { title: "VERIFY early turnover", projectCode: "DEMO-D1", templateId: turnover.id } })).status, 409);
  rec("Project Closeout on a Design project -> 409", (await raw("/workflows", eng, { method: "POST", body: { title: "VERIFY closeout on D1", projectCode: "DEMO-D1", templateId: closeout.id } })).status, 409);
  const stages = (await q(`SELECT string_agg(x->>'role', ' > ') s FROM workflow_templates t, jsonb_array_elements(t.default_stages::jsonb) x WHERE t.name='Design Turnover' GROUP BY t.id`))[0]?.s;
  rec("Design Turnover stage order", stages, "architect > consultant > project-manager > admin");

  // Advance (Proposal -> Design) created one plan set per discipline chosen at creation.
  const chosen = ((await q(`SELECT design_disciplines d FROM projects WHERE code = 'DEMO-D1'`))[0].d as string[]).slice().sort().join(",");
  rec("plan sets created on Advance = disciplines chosen at creation", sets.map((x) => x.discipline).sort().join(","), chosen);
  rec("the throwaway project has no plan sets before it reaches Design", (await q(`SELECT count(*)::int n FROM project_deliverables WHERE project_code = 'VERIFY-D2'`))[0].n, 0);

  console.table(out);
  console.log(failed === 0 ? "ALL PHASE 3 API CHECKS PASSED" : `${failed} CHECK(S) FAILED`);

  // Cleanup the throwaway projects
  for (const code of ["VERIFY-D2", "VERIFY-C2"]) {
    await q(`DELETE FROM proposals WHERE project_code=$1`, [code]);
    await q(`DELETE FROM workflows WHERE project_code=$1`, [code]);
    await q(`DELETE FROM project_deliverables WHERE project_code=$1`, [code]);
    await q(`DELETE FROM project_phase_history WHERE project_code=$1`, [code]);
    await q(`DELETE FROM notifications WHERE project_code=$1`, [code]);
    await q(`DELETE FROM projects WHERE code=$1`, [code]);
  }
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    setTimeout(() => process.exit(process.exitCode ?? 0), 250);
  });
