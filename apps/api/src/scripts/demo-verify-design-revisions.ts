// apps/api/src/scripts/demo-verify-design-revisions.ts
//
// Evidence for the design-revision work: project link, scoping (direct API
// calls), no write on read, create hardening (numbering, duplicate 409, locked
// project, author override, audit row, designs.version sync), role permissions,
// and the admin-only demo endpoint. Cleans up the one throwaway revision it
// creates. Needs the API running (`npm run dev`).
//
// Run with: npx tsx src/scripts/demo-verify-design-revisions.ts
import "dotenv/config";
import pg from "pg";
import { assertDemoApi, assertDemoDatabase } from "./demo-guard.js";
import { api, BASE, login, raw, EMAILS } from "./demo-seed-lib.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
let failed = 0;
const row = (name: string, got: unknown, expected: unknown) => {
  const ok = String(got) === String(expected);
  if (!ok) failed += 1;
  return { check: name, got, expected, result: ok ? "PASS" : "FAIL" };
};
const rows: Record<string, unknown>[] = [];

async function main() {
  assertDemoDatabase();
  assertDemoApi(BASE);
  const [admin, archi, archi1, pm, pm1, eng, eng1, cons, site, hr] = await Promise.all([
    login(EMAILS.admin), login(EMAILS.architect), login(EMAILS.architect1), login(EMAILS.pm), login(EMAILS.pm1),
    login(EMAILS.engineer), login(EMAILS.engineer1), login(EMAILS.consultant), login(EMAILS.site), login(EMAILS.hr),
  ]);

  // 2. Link: API vs SQL
  const sqlCount = (await q(`SELECT count(*)::int n FROM design_revisions r JOIN designs d ON d.id=r.design_id WHERE d.project_code='DEMO-S4'`))[0].n;
  const s4 = await raw("/design-revisions?projectCode=DEMO-S4", admin);
  rows.push(row("GET ?projectCode=DEMO-S4 count == SQL join count", s4.data?.length, sqlCount));
  rows.push(row("items carry designCode/designName/projectCode", !!(s4.data?.[0]?.designCode && s4.data?.[0]?.designName && s4.data?.[0]?.projectCode === "DEMO-S4"), true));

  // 3. Scoping
  const status = async (token: string, path: string) => (await raw(path, token)).status;
  rows.push(row("PM who does not own DEMO-S4 (pm1) -> 403", await status(pm1, "/design-revisions?projectCode=DEMO-S4"), 403));
  rows.push(row("engineer not staffed on DEMO-S4 (engineer1) -> 403", await status(eng1, "/design-revisions?projectCode=DEMO-S4"), 403));
  rows.push(row("owning PM (pm) -> 200", await status(pm, "/design-revisions?projectCode=DEMO-S4"), 200));
  rows.push(row("admin -> 200", await status(admin, "/design-revisions?projectCode=DEMO-S4"), 200));
  rows.push(row("staffed consultant -> 200", await status(cons, "/design-revisions?projectCode=DEMO-S4"), 200));
  rows.push(row("staffed engineer -> 200", await status(eng, "/design-revisions?projectCode=DEMO-S4"), 200));
  rows.push(row("site personnel not staffed on DEMO-S2 -> 403", await status(site, "/design-revisions?projectCode=DEMO-S2"), 403));
  const codesOf = async (token: string) => {
    const r = await raw("/design-revisions", token);
    const ids = new Set((r.data ?? []).map((x: any) => x.projectCode));
    return [...ids].sort().join(",");
  };
  rows.push(row("architect@ list (no projectCode) only S2,S3,S4", await codesOf(archi), "DEMO-S2,DEMO-S3,DEMO-S4"));
  rows.push(row("architect1@ list only S5,S6,S7", await codesOf(archi1), "DEMO-S5,DEMO-S6,DEMO-S7"));
  rows.push(row("pm@ list only own projects (S2..S5)", await codesOf(pm), "DEMO-S2,DEMO-S3,DEMO-S4,DEMO-S5"));
  rows.push(row("admin list sees all (S2..S7)", await codesOf(admin), "DEMO-S2,DEMO-S3,DEMO-S4,DEMO-S5,DEMO-S6,DEMO-S7"));
  rows.push(row("architect@ GET /design-revisions/:id of S5 -> 403", await (async () => {
    const id = (await q(`SELECT r.id FROM design_revisions r JOIN designs d ON d.id=r.design_id WHERE d.project_code='DEMO-S5' LIMIT 1`))[0].id;
    return status(archi, `/design-revisions/${id}`);
  })(), 403));

  // 4. No write on read
  const snap = async () => (await q(`SELECT (SELECT count(*) FROM design_revisions)::int r, (SELECT count(*) FROM designs)::int d, (SELECT md5(string_agg(x::text,'|' ORDER BY x::text)) FROM design_revisions x) rh, (SELECT md5(string_agg(x::text,'|' ORDER BY x::text)) FROM designs x) dh`))[0];
  const before = await snap();
  for (const t of [admin, archi, pm, cons, eng]) {
    await raw("/design-revisions", t);
    for (const c of ["DEMO-S1", "DEMO-S2", "DEMO-S3", "DEMO-S4", "DEMO-S5", "DEMO-S6", "DEMO-S7"]) await raw(`/design-revisions?projectCode=${c}`, t);
    await raw("/designs", t);
  }
  const after = await snap();
  rows.push(row("row counts + content hash of design_revisions/designs unchanged after all GETs", JSON.stringify(before) === JSON.stringify(after), true));

  // 6. Create hardening (throwaway revision on DSN-S4-MECH, then removed)
  const mech = (await q(`SELECT id, version, revision, project_code FROM designs WHERE code='DSN-S4-MECH'`))[0];
  const auditBefore = (await q(`SELECT count(*)::int n FROM audit_logs WHERE entity_type='design-revision'`))[0].n;
  const created = await raw("/design-revisions", archi, { method: "POST", body: { designId: mech.id, version: "v9.0", reason: "Verification probe", createdBy: "Someone Else Entirely", status: "Approved" } });
  rows.push(row("architect creates a revision -> 201", created.status, 201));
  const newRow = created.data;
  rows.push(row("author comes from the session, not the body", newRow?.createdBy, "Ana Villanueva"));
  rows.push(row("revisionNumber auto-incremented (3 -> 4)", newRow?.revisionNumber, 4));
  rows.push(row("parentVersion defaults to the design's previous version", newRow?.parentVersion, mech.version));
  rows.push(row("approvedAt set because status Approved", !!newRow?.approvedAt, true));
  const d2 = (await q(`SELECT version, revision FROM designs WHERE id=$1`, [mech.id]))[0];
  rows.push(row("designs.version/revision updated", `${d2.version}/${d2.revision}`, "v9.0/4"));
  const dup = await raw("/design-revisions", archi, { method: "POST", body: { designId: mech.id, version: "v9.0", createdBy: "x y" } });
  rows.push(row("duplicate (design, version) -> 409", dup.status, 409));
  const auditAfter = (await q(`SELECT count(*)::int n FROM audit_logs WHERE entity_type='design-revision'`))[0].n;
  rows.push(row("audit row written for the create", auditAfter - auditBefore, 1));
  const archived = (await q(`SELECT id FROM designs WHERE project_code='DEMO-S7' ORDER BY id LIMIT 1`))[0].id;
  const locked = await raw("/design-revisions", archi1, { method: "POST", body: { designId: archived, version: "v9.9", createdBy: "x y" } });
  rows.push(row("write on an Archived project (DEMO-S7) -> 409", `${locked.status} ${locked.message}`, "409 Project is Archived — changes are locked"));
  // roles
  rows.push(row("engineer cannot write -> 403", (await raw("/design-revisions", eng, { method: "POST", body: { designId: mech.id, version: "v9.1", createdBy: "x y" } })).status, 403));
  rows.push(row("project manager cannot write -> 403", (await raw("/design-revisions", pm, { method: "POST", body: { designId: mech.id, version: "v9.1", createdBy: "x y" } })).status, 403));
  rows.push(row("HR cannot write -> 403", (await raw("/design-revisions", hr, { method: "POST", body: { designId: mech.id, version: "v9.1", createdBy: "x y" } })).status, 403));
  // clean up the probe
  if (newRow?.id) {
    await raw(`/design-revisions/${newRow.id}`, archi, { method: "DELETE" });
    await q(`UPDATE designs SET version=$2, revision=$3 WHERE id=$1`, [mech.id, mech.version, mech.revision]);
  }

  // 7. Demo endpoint
  rows.push(row("POST /design-revisions/demo as architect -> 403", (await raw("/design-revisions/demo?projectCode=DEMO-S4", archi, { method: "POST" })).status, 403));
  rows.push(row("POST /design-revisions/demo as PM -> 403", (await raw("/design-revisions/demo?projectCode=DEMO-S4", pm, { method: "POST" })).status, 403));
  const demo = await raw("/design-revisions/demo?projectCode=DEMO-S4", admin, { method: "POST" });
  rows.push(row("POST /design-revisions/demo as admin on a project with revisions -> 0 created", `${demo.status} created=${demo.data?.created} (${demo.data?.skipped})`, "200 created=0 (already has revisions)"));
  const prop = await raw("/design-revisions/demo?projectCode=DEMO-S1", admin, { method: "POST" });
  rows.push(row("Proposal-phase project skipped by default", `${prop.status} created=${prop.data?.created}`, "200 created=0"));
  rows.push(row("meta.demoAllowed present on project listing", s4.meta?.demoAllowed, true));
  rows.push(row("meta summary total", s4.meta?.total, sqlCount));

  console.table(rows);
  console.log(failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
  process.exitCode = failed ? 1 : 0;
  void api;
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
