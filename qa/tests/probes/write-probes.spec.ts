// Valid-payload write probes for the 20 write cells where Phase B saw a role get past the role check (400/404 instead of 403).
// For each endpoint: (1) the correct role must get a 2xx with a valid payload (otherwise the probe is not valid), then
// (2) every wrong role gets a FRESH fixture of its own and a valid payload: 2xx = authorization hole, 403 = fine.
// Writes real rows into the QA database, so it only runs with QA_WRITE_PROBES=1 and the run is wrapped in a dump/restore
// (see qa/README.md, "Write probes"). Never runs against anything but QA_DATABASE_URL (the guard sees to that).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createProject, session, call } from "../../src/api.js";
import { api, raw, staff, upload, createRfi, employeeIdOf, startWorkflow, pdfBytes, uid, today, plus, PM, ADMIN, ARCH, CONS, ENG, SITE, FIN, HR, IT, OWNER, expect, test, type QaProject } from "../../src/kit.js";
import { assertQaEnvironment } from "../../src/guard.js";

test.skip(process.env.QA_WRITE_PROBES !== "1", "write probes create data; run them only through the dump/restore wrapper (QA_WRITE_PROBES=1)");

interface Row { endpoint: string; cell: string; role: string; kind: "baseline" | "wrong-role"; status: number; verdict: string; note?: string }
const rows: Row[] = [];
const ok = (s: number) => s >= 200 && s < 300;
const verdict = (kind: Row["kind"], s: number) => kind === "baseline" ? (ok(s) ? "baseline OK" : `BASELINE FAILED (${s})`) : ok(s) ? "AUTHORIZATION HOLE (2xx)" : s === 403 ? "fine (403)" : `inconclusive (${s})`;

async function probe(endpoint: string, correct: string, wrong: { role: string; cell: string; note?: string }[], fixture: () => Promise<(role: string) => Promise<number>>) {
  // one fresh fixture per attempt so a successful wrong-role write cannot hide behind a consumed one
  const base = await (await fixture())(correct);
  rows.push({ endpoint, cell: "(correct role)", role: correct, kind: "baseline", status: base, verdict: verdict("baseline", base) });
  for (const w of wrong) {
    const s = await (await fixture())(w.role);
    rows.push({ endpoint, cell: w.cell, role: w.role, kind: "wrong-role", status: s, verdict: verdict("wrong-role", s), note: w.note });
  }
}

const withProject = async (phase: "Proposal" | "Design" | "Construction" | "Closeout", staffed: [string, string][] = []) => {
  const p = await createProject({ phase, creator: PM, name: `QA wp ${uid()}` });
  for (const [role, member] of staffed) await staff(p, role, member);
  return p;
};
const TEAM: [string, string][] = [[ARCH, "architect"], [CONS, "consultant"], [ENG, "engineer"], [SITE, "site-personnel"]];

test("write probes", async () => {
  test.setTimeout(240_000);
  const cfg = assertQaEnvironment();
  const tokenOf = async (role: string) => (await session(role)).token;
  const post = async (role: string, method: string, path: string, body?: unknown) => (await call(role, method, path, body)).status;

  // 1. POST /documents/upload (multipart)
  await probe("POST /documents/upload", PM, [
    { role: "Site Personnel", cell: "Documents: Site Personnel (View only)" },
    { role: "Consultant", cell: "Documents: Consultant (View only)" },
    { role: PM, cell: "Field Documentation: Project Manager (View only)", note: "PM is Full on Documents, which uses this same endpoint: not an independent hole" },
  ], async () => {
    const p = await withProject("Construction", TEAM);
    return async (role) => {
      const fd = new FormData();
      fd.set("file", new Blob([pdfBytes("probe")], { type: "application/pdf" }), "probe.pdf");
      for (const [k, v] of Object.entries({ documentId: `WP${uid()}`, title: "Write probe", project: p.code, type: "Contract", version: "1.0" })) fd.set(k, v);
      const r = await fetch(`${cfg.apiUrl}/documents/upload`, { method: "POST", headers: { Authorization: `Bearer ${await tokenOf(role)}` }, body: fd });
      return r.status;
    };
  });

  // 2. POST /blueprints
  await probe("POST /blueprints", ARCH, [{ role: PM, cell: "Blueprints: Project Manager (View only)" }, { role: CONS, cell: "Blueprints: Consultant (View only)" }], async () => {
    const p = await withProject("Design", TEAM);
    const arch = await session(ARCH);
    const a = await upload(ARCH, `${p.code}-a.png`, "png"), b = await upload(ARCH, `${p.code}-b.pdf`);
    const d = await api<{ id: number }>(ARCH, "POST", "/designs", { code: `DSN-${uid()}`, name: `${p.code} design`, projectCode: p.code, discipline: "Structural", category: "Structural", leadArchitect: arch.name, fileUrls: [{ name: a.filename, url: a.url }, { name: b.filename, url: b.url }] });
    return (role) => post(role, "POST", "/blueprints", { drawingNumber: `BP-${uid()}`, title: "Write probe", folder: "Structural", discipline: "Structural", scale: "1:100", revision: "A", author: arch.name, approval: "Approved", status: "Current", fileType: "PDF", sizeKb: 1, projectCode: p.code, designId: d.id });
  });

  // 3. POST /proposals/submit
  await probe("POST /proposals/submit", ARCH, [{ role: ADMIN, cell: "Proposals: Admin (View only)" }], async () => {
    const p = await withProject("Proposal", TEAM);
    return async (role) => post(role, "POST", "/proposals/submit", { proposalId: `PRP-${uid()}`, title: "Write probe", projectCode: p.code, submittedBy: (await session(role)).name, amount: "1000000", content: "Valid write probe payload." });
  });

  // 4. POST /design-requests (raise an RFI)
  await probe("POST /design-requests", PM, [{ role: ADMIN, cell: "RFI / RFA: Admin (View only)" }], async () => {
    const p = await withProject("Construction", TEAM);
    return async (role) => (await createRfi(p, role, ARCH)).status;
  });

  // 5. POST /attendance (clock in)
  await probe("POST /attendance", SITE, [{ role: IT, cell: "Attendance Clock-in: IT Designer (Deny)" }], async () => {
    const p = await withProject("Construction", TEAM);
    const emp = await employeeIdOf(SITE);
    const photo = await upload(SITE, "probe.png", "png");
    return (role) => post(role, "POST", "/attendance", { employeeId: emp, site: "QA site", projectCode: p.code, clockIn: "08:00", latitude: 14.6, longitude: 121.0, photoUrl: photo.url, logDate: plus(-(20000 + Math.floor(Math.random() * 9000))) });
  });

  // 6. POST /workflows (start the Project Closeout workflow)
  await probe("POST /workflows (Project Closeout)", ENG, [
    { role: PM, cell: "ACTION Start Closeout workflow: Project Manager (Deny)" }, { role: HR, cell: "Human Resources (Deny)" },
    { role: FIN, cell: "Finance Manager (Deny)" }, { role: ARCH, cell: "Architect (Deny)" }, { role: CONS, cell: "Consultant (Deny)" },
  ], async () => {
    const p = await withProject("Closeout", TEAM);
    return async (role) => (await startWorkflow(role, "Project Closeout", p)).status;
  });

  // 7. POST /design-requests/:id/send (countersign an Engineer's draft)
  await probe("POST /design-requests/:id/send", PM, [{ role: ADMIN, cell: "ACTION Send Engineer's draft: Admin (Deny)" }], async () => {
    const p = await withProject("Construction", TEAM);
    const draft = await createRfi(p, ENG, ARCH);
    if (!draft.ok) throw new Error(`draft RFI not created: ${draft.status}`);
    return (role) => post(role, "POST", `/design-requests/${draft.data.id}/send`, { dueDays: 3 });
  });

  // 8. POST /design-requests/:id/respond
  await probe("POST /design-requests/:id/respond", ARCH, [
    { role: ADMIN, cell: "ACTION Answer RFI/RFA: Admin (Deny)" }, { role: PM, cell: "Project Manager (Deny)" }, { role: ENG, cell: "Engineer (Deny)" },
  ], async () => {
    const p = await withProject("Construction", TEAM);
    const rfi = await createRfi(p, PM, ARCH);
    if (!rfi.ok) throw new Error(`RFI not created: ${rfi.status}`);
    return (role) => post(role, "POST", `/design-requests/${rfi.data.id}/respond`, { responseText: "Valid write probe answer." });
  });

  // 9. PATCH /milestones/:id (mark completed)
  await probe("PATCH /milestones/:id (completed)", PM, [{ role: ADMIN, cell: "ACTION Mark milestone completed: Admin (Deny)" }], async () => {
    const p = await withProject("Construction", TEAM);
    const m = await api<{ id: number }>(PM, "POST", "/milestones", { projectCode: p.code, title: "Write probe", description: "QA", estimatedCompletionDate: plus(40) });
    await api(PM, "PATCH", `/milestones/${m.id}`, { status: "active" });
    return (role) => post(role, "PATCH", `/milestones/${m.id}`, { status: "completed" });
  });

  // 10/11. payroll
  const emp = await employeeIdOf(SITE);
  const batch = async (submit: boolean) => {
    const p = await withProject("Construction", TEAM);
    const r = await raw(HR, "POST", "/payroll/generate", { period: `WP ${uid()}`, projectCode: p.code, entries: [{ employeeId: emp, hoursWorked: 8 }], submit });
    if (!r.ok) throw new Error(`payroll batch not created: ${r.status} ${r.body?.message}`);
    return String(r.data.batch.id);
  };
  await probe("POST /payroll/batches/:id/submit", HR, [{ role: IT, cell: "ACTION Build and submit payroll batch: IT Designer (Deny)" }], async () => {
    const id = await batch(false);
    return (role) => post(role, "POST", `/payroll/batches/${id}/submit`, {});
  });
  await probe("POST /finance/payroll-review/:id/decide", FIN, [{ role: IT, cell: "ACTION Approve or return payroll batch: IT Designer (Deny)" }], async () => {
    const id = await batch(true);
    return (role) => post(role, "POST", `/finance/payroll-review/${id}/decide`, { decision: "approved" });
  });

  // Extra, not one of the 20 cells: POST /documents (JSON) has no role guard in the route definition.
  await probe("POST /documents (JSON, extra)", PM, [{ role: HR, cell: "extra: Human Resources" }, { role: FIN, cell: "extra: Finance Manager" }, { role: OWNER, cell: "extra: Owner" }], async () => {
    const p = await withProject("Construction", TEAM);
    const f = await upload(PM, "probe.pdf");
    return async (role) => post(role, "POST", "/documents", { documentId: `WP${uid()}`, title: "Write probe", project: p.code, type: "Contract", version: "1.0", size: "1 KB", fileUrl: f.url, uploadedBy: (await session(role)).name });
  });

  mkdirSync(join(import.meta.dirname, "..", "..", "results"), { recursive: true });
  writeFileSync(join(import.meta.dirname, "..", "..", "results", "write-probes.json"), JSON.stringify(rows, null, 2));
  expect(rows.filter((r) => r.verdict.startsWith("BASELINE FAILED")), "a baseline (correct role) probe failed, so its wrong-role results are not valid").toEqual([]);
});
