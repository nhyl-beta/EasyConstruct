// LC-130 attendance, LC-132 issues/K3, LC-133 Budget Change Request, LC-134 RFI/RFA, LC-135 payroll batch states.
// Reference: qa/spec/lifecycle.md sections 3 and 5.
import { createProject, api, raw, view, gateState, staff, upload, decide, startWorkflow, createRfi, employeeIdOf, steps, expect, test,
  PM, ADMIN, ARCH, CONS, ENG, SITE, FIN, HR, today, plus, uid, type QaProject } from "../../src/kit.js";
import { session } from "../../src/api.js";
import { assertQaEnvironment } from "../../src/guard.js";

async function approvedBudget(p: QaProject, category = "Materials", planned = 1_000_000) {
  const fin = await session(FIN);
  const b = await api<{ id: number }>(FIN, "POST", "/finance/budgets", { project: p.code, category, owner: fin.name, planned, fiscalYear: today().slice(0, 4) });
  for (const stage of ["draft", "pending-review", "finance-review", "manager-review"]) await api(FIN, "POST", "/finance/budget-approval-steps/decide", { budgetId: b.id, stage, decision: "approved", actor: fin.name });
  return b.id;
}
const budgetPlanned = async (id: number) => Number((await api<any[]>(FIN, "GET", "/finance/budgets")).find((b) => b.id === id)?.planned);

test("LC-130 Attendance works only in Construction or Closeout (geofence)", async () => {
  const S = steps("LC-130");
  const pre = await createProject({ phase: "Pre-Construction", creator: PM, name: `QA att-pre ${uid()}` });
  const con = await createProject({ phase: "Construction", creator: PM, name: `QA att-con ${uid()}`, siteLatitude: 14.6, siteLongitude: 121.0, geofenceRadiusM: 300 });
  for (const p of [pre, con]) await staff(p, SITE, "site-personnel");
  const emp = await employeeIdOf(SITE);
  const photo = await upload(SITE, "clockin.png", "png");
  // One record per employee per day: use a fresh (past) day per run so repeated runs do not collide.
  const day = plus(-(1 + Math.floor(Math.random() * 3000)));
  const clock = (p: QaProject, lat: number, lng: number, time: string, logDate = day) =>
    raw(SITE, "POST", "/attendance", { employeeId: emp, site: "QA site", projectCode: p.code, clockIn: time, latitude: lat, longitude: lng, photoUrl: photo.url, logDate });
  let insideId = 0;
  await S.run(1, "Clock in on a Pre-Construction project -> rejected", async () => {
    const r = await clock(pre, 14.6, 121.0, "08:00", plus(-(6200 + Math.floor(Math.random() * 3000))));
    expect(r.ok, `clock-in was accepted in Pre-Construction (${r.status})`).toBe(false);
  });
  await S.run(2, "Clock in inside the geofence on a Construction project -> accepted with timestamp", async () => {
    const r = await clock(con, 14.6, 121.0, "08:05");
    expect(r.ok, `inside-geofence clock-in failed: ${r.status} ${r.body?.message}`).toBe(true);
    insideId = r.data?.id;
    expect(JSON.stringify(r.data), "no timestamp on the record").toMatch(/clockIn|createdAt|time/i);
  });
  await S.run(3, "Clock in outside the geofence -> flagged or blocked with an alert", async () => {
    const r = await clock(con, 14.9, 121.5, "13:00", plus(-(3100 + Math.floor(Math.random() * 3000))));
    const flagged = !r.ok || /flag|outside/i.test(JSON.stringify(r.data));
    expect(flagged, `outside-geofence clock-in was accepted unflagged: ${r.status} ${JSON.stringify(r.data ?? r.body).slice(0, 160)}`).toBe(true);
  });
  let importedId = 0;
  await S.run(4, "Site Personnel imports an attendance sheet -> the rows are Pending until HR verifies them", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Attendance");
    // The importer rejects dates already recorded for the worker, so preview candidate days (last 90 days) until one is free.
    const send = async (buffer: Buffer, path: string) => {
      const fd = new FormData();
      fd.set("file", new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "attendance.xlsx");
      fd.set("projectCode", con.code);
      const r = await fetch(`${assertQaEnvironment().apiUrl}${path}`, { method: "POST", headers: { Authorization: `Bearer ${(await session(SITE)).token}` }, body: fd });
      return { status: r.status, body: (await r.json().catch(() => null)) as any };
    };
    const sheetFor = async (date: string) => {
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Attendance");
      ws.addRow(["Worker ID", "Date", "Time In", "Time Out", "Status", "Remarks"]);
      ws.addRow([emp, date, "08:00", "17:00", "Present", "QA sheet import"]);
      return Buffer.from(await wb.xlsx.writeBuffer());
    };
    let date = "", buffer!: Buffer;
    for (let tries = 0; tries < 40 && !date; tries++) {
      const candidate = plus(-(3 + Math.floor(Math.random() * 85)));
      const b = await sheetFor(candidate);
      const pv = await send(b, "/attendance/import/preview");
      expect(pv.status, `preview: ${pv.status} ${pv.body?.message}`).toBe(200);
      if (pv.body?.data?.validRows === 1) { date = candidate; buffer = b; }
    }
    expect(date, "no free day in the last 90 days for this worker (every candidate was rejected by the preview)").not.toBe("");
    const commit = await send(buffer, "/attendance/import/commit");
    expect(commit.status, `commit: ${commit.status} ${commit.body?.message}`).toBe(201);
    expect(JSON.stringify(commit.body?.data), "no row was imported").toMatch(/"imported":\s*1/);
    const mine = (await api<any[]>(HR, "GET", "/hr/attendance")).filter((x) => x.projectCode === con.code && String(x.logDate ?? x.date ?? "").startsWith(date));
    expect(mine.length, "the imported row is not in HR's attendance list").toBeGreaterThan(0);
    importedId = mine[0].id;
    expect(String(mine[0].status), "imported rows should be Pending until HR verifies them").toBe("Pending");
  });
  await S.run(5, "HR verifies the records -> verified rows leave Pending", async () => {
    const r = await raw(HR, "PATCH", `/attendance/${insideId}`, { status: "Verified" });
    expect(r.ok, `verify: ${r.status} ${r.body?.message}`).toBe(true);
    const rows = await api<any[]>(HR, "GET", "/hr/attendance");
    expect(rows.find((x) => x.id === insideId)?.status, "record is still not Verified").toBe("Verified");
    if (importedId) {
      const v = await raw(HR, "PATCH", `/attendance/${importedId}`, { status: "Verified" });
      expect(v.ok, `verify imported row: ${v.status} ${v.body?.message}`).toBe(true);
      expect((await api<any[]>(HR, "GET", "/hr/attendance")).find((x) => x.id === importedId)?.status, "imported row did not leave Pending").toBe("Verified");
    }
  });
  S.done();
});

test("LC-132 Critical issue flow and gate K3", async () => {
  const S = steps("LC-132");
  const p = await createProject({ phase: "Construction", creator: PM, name: `QA issue ${uid()}` });
  await staff(p, ENG, "engineer"); await staff(p, SITE, "site-personnel");
  // K1/K2 are irrelevant to K3; only K3 is read
  const critical = async () => { const d = JSON.stringify(await api(ENG, "GET", "/dashboard/summary")); const m = d.match(/"critical[A-Za-z]*":\s*(\d+)/i); return m ? Number(m[1]) : NaN; };
  let id = 0, before = NaN;
  await S.run(1, "Engineer reports a Critical issue -> saved with a priority badge", async () => {
    before = await critical();
    const r = await raw(ENG, "POST", "/issues", { issueCode: `ISS-${p.code}`, projectCode: p.code, category: "Safety", severity: "Critical", title: "QA critical issue", description: "Critical safety deviation found by the QA suite.", reportedByName: "Paolo Mendoza" });
    expect(r.ok, `create: ${r.status} ${r.body?.message}`).toBe(true);
    id = r.data.id;
    expect(r.data.severity).toBe("Critical");
  });
  await S.run(2, "Engineer dashboard Critical count +1", async () => {
    let after = await critical();
    for (let i = 0; i < 8 && after === before; i++) { await new Promise((r) => setTimeout(r, 1500)); after = await critical(); }
    if (after !== before) test.info().annotations.push({ type: "remark", description: "dashboard count changed only after polling (cached)" });
    expect(Number.isNaN(before) || Number.isNaN(after) ? "no critical-issues field in /dashboard/summary" : after - before, `critical issues went ${before} -> ${after}`).toBe(1);
  });
  await S.run(3, "K3 fails while the issue is Submitted or Under Review", async () => {
    expect(gateState(await view(p), "K3")?.passed).toBe(false);
  });
  await S.run(5, "PM resolves the issue -> K3 passes; Engineer count -1", async () => {
    const r = await raw(PM, "PATCH", `/issues/${id}/status`, { status: "Resolved", resolutionNotes: "Corrected on site." });
    expect(r.ok, `resolve: ${r.status} ${r.body?.message}`).toBe(true);
    expect(gateState(await view(p), "K3")?.passed).toBe(true);
    let c = await critical();
    for (let i = 0; i < 8 && c !== before; i++) { await new Promise((r) => setTimeout(r, 1500)); c = await critical(); }
    expect(c, "Engineer's Critical count did not drop back").toBe(before);
  });
  S.done();
});

test("LC-133 Budget Change Request: Engineer, Finance, PM, Admin", async () => {
  const S = steps("LC-133");
  const p = await createProject({ phase: "Construction", creator: PM, name: `QA bcr ${uid()}` });
  await staff(p, ENG, "engineer");
  const budgetId = await approvedBudget(p);
  const planned0 = await budgetPlanned(budgetId);
  let wf = 0;
  const bcr = async () => startWorkflow(ENG, "Budget Change Request", p, { amount: 100_000, budgetId });
  await S.run(1, "Engineer starts a Budget Change Request -> workflow active; K4 fails", async () => {
    const r = await bcr();
    expect(r.ok, `start: ${r.status} ${r.body?.message}`).toBe(true);
    wf = r.data.id;
    expect(gateState(await view(p), "K4")?.passed, "K4 passed with an active workflow").toBe(false);
  });
  await S.run(2, "Finance approves its stage -> moves to PM", async () => {
    const r = await decide(wf, "finance-manager", FIN); expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
  });
  await S.run(3, "PM approves -> moves to Admin", async () => {
    const r = await decide(wf, "project-manager", PM); expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
  });
  await S.run(4, "Admin approves the final stage -> budget_adjustments row and budgets.planned updated", async () => {
    const r = await decide(wf, "admin", ADMIN); expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    const adj = JSON.stringify(await api(FIN, "GET", "/finance/budget-adjustments"));
    expect(adj, "no budget adjustment recorded for the project").toContain(p.code);
    const planned1 = await budgetPlanned(budgetId);
    expect(planned1, `budgets.planned went ${planned0} -> ${planned1}, expected +100000`).toBe(planned0 + 100_000);
  });
  await S.run(5, "K4 passes once no workflow is active", async () => {
    expect(gateState(await view(p), "K4")?.passed).toBe(true);
  });
  await S.run(6, "Finance rejects a second request with a reason -> halts with the reason shown", async () => {
    const r = await bcr(); expect(r.ok, `start: ${r.status} ${r.body?.message}`).toBe(true);
    const d = await decide(r.data.id, "finance-manager", FIN, "reject", "QA rejection reason");
    expect(d.ok, `reject: ${d.status} ${d.body?.message}`).toBe(true);
    expect(JSON.stringify(await api(PM, "GET", `/workflows/${r.data.id}`)), "the rejection reason is not shown").toContain("QA rejection reason");
  });
  S.done();
});

test("LC-134 RFI/RFA raise, countersign, answer, number, due date", async () => {
  const S = steps("LC-134");
  const p = await createProject({ phase: "Construction", creator: PM, name: `QA rfi ${uid()}` });
  await staff(p, ENG, "engineer"); await staff(p, ARCH, "architect"); await staff(p, CONS, "consultant");
  const days = (iso: string) => Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(today())) / 864e5);
  let draftId = 0, rfiId = 0, rfaId = 0;
  await S.run(1, "PM raises an RFI: numbered {KIND}-{PROJECT}-{DISC}-{SEQ:3}-{YY}; due in 3 days", async () => {
    const r = await createRfi(p, PM, ARCH); expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    rfiId = r.data.id;
    expect(r.data.number).toMatch(new RegExp(`^RFI-${p.code}-AR-\\d{3}-\\d{2}$`));
    expect(days(String(r.data.dueDate ?? r.data.dueAt)), `due in ${days(String(r.data.dueDate ?? r.data.dueAt))} days`).toBe(3);
  });
  await S.run(2, "PM raises an RFA: due in 4 days", async () => {
    const r = await createRfi(p, PM, CONS, { kind: "RFA", dueDays: 4 }); expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    rfaId = r.data.id;
    expect(days(String(r.data.dueDate ?? r.data.dueAt))).toBe(4);
  });
  await S.run(3, "Engineer raises an RFI as a draft: the recipient does not see it until the PM sends it", async () => {
    const r = await createRfi(p, ENG, ARCH); expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    draftId = r.data.id;
    expect(String(r.data.status)).toBe("draft");
    const seen = (await api<any[]>(ARCH, "GET", "/design-requests")).some((x) => x.id === draftId);
    expect(seen, "the Architect can already see the Engineer's draft").toBe(false);
  });
  await S.run(4, "PM sends the Engineer's draft (countersign) -> recipient sees it", async () => {
    const r = await raw(PM, "POST", `/design-requests/${draftId}/send`, { dueDays: 3 }); expect(r.ok, `send: ${r.status} ${r.body?.message}`).toBe(true);
    expect((await api<any[]>(ARCH, "GET", "/design-requests")).some((x) => x.id === draftId), "recipient still cannot see it").toBe(true);
  });
  await S.run(5, "Architect answers the RFI -> answered; no longer blocks", async () => {
    const r = await raw(ARCH, "POST", `/design-requests/${rfiId}/respond`, { responseText: "Confirmed as drawn." }); expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    expect(String(r.data.status)).toBe("answered");
  });
  await S.run(6, "Consultant answers an RFA -> approved or approved_as_noted; no longer blocks", async () => {
    const r = await raw(CONS, "POST", `/design-requests/${rfaId}/respond`, { responseText: "Approved with note.", outcome: "approved_as_noted" }); expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    expect(String(r.data.status)).toMatch(/^approved(_as_noted)?$/);
  });
  await S.run(8, "PM starts a Change Order from an RFI with cost impact -> workflow starts and blocks K4", async () => {
    const rfi = await createRfi(p, PM, ARCH, { costImpact: "increase", costNote: "QA cost impact" }); expect(rfi.ok).toBe(true);
    const r = await startWorkflow(PM, "Change Order Request", p, { amount: 50_000 });
    expect(r.ok, `Change Order start: ${r.status} ${r.body?.message}`).toBe(true);
    expect(gateState(await view(p), "K4")?.passed).toBe(false);
  });
  S.done();
});

test("LC-135 Payroll batch states and statutory amounts", async () => {
  const S = steps("LC-135");
  const p = await createProject({ phase: "Construction", creator: PM, name: `QA payroll ${uid()}` });
  await staff(p, SITE, "site-personnel");
  const emp = await employeeIdOf(SITE);
  const me = await api<any>(SITE, "GET", "/employees/me");
  const rate = Number(me.payRate); // hourly
  let batchId = "";
  const statusOf = async () => String((await api<any[]>(HR, "GET", "/payroll/batches/all")).find((b) => b.id === batchId)?.status);
  await S.run(1, "HR builds a batch -> draft; gross equals independent hours x rate", async () => {
    const r = await raw(HR, "POST", "/payroll/generate", { period: `QA ${p.code}`, projectCode: p.code, entries: [{ employeeId: emp, hoursWorked: 40 }] });
    expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    batchId = String(r.data.batch.id);
    expect(Number(r.data.lines[0].gross), `gross ${r.data.lines[0].gross}, expected 40 x ${rate}`).toBe(40 * rate);
    expect(String(r.data.batch.status).toLowerCase()).toMatch(/draft/);
  });
  await S.run(2, "No manual input for statutory amounts", async () => {
    const r = await raw(HR, "POST", "/payroll/generate", { period: `QA2 ${p.code}`, projectCode: p.code, entries: [{ employeeId: emp, hoursWorked: 8, sss: 999 }] });
    expect(r.ok, "payroll accepted a typed SSS amount").toBe(false);
  });
  await S.run(4, "HR submits the batch -> pending", async () => {
    const r = await raw(HR, "POST", `/payroll/batches/${batchId}/submit`, {}); expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    expect((await statusOf()).toLowerCase()).toBe("pending");
  });
  await S.run(5, "Finance returns the batch -> revision_required", async () => {
    const r = await raw(FIN, "POST", `/finance/payroll-review/${batchId}/decide`, { decision: "rejected", reasonCode: "attendance_discrepancy", comment: "QA please re-check hours" });
    expect(r.ok, `decide: ${r.status} ${r.body?.message}`).toBe(true);
    expect((await statusOf()).toLowerCase()).toBe("revision_required");
  });
  await S.run(6, "HR resubmits -> pending again", async () => {
    const r = await raw(HR, "POST", `/payroll/batches/${batchId}/submit`, {}); expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    expect((await statusOf()).toLowerCase()).toBe("pending");
  });
  await S.run(7, "Finance approves -> approved", async () => {
    const r = await raw(FIN, "POST", `/finance/payroll-review/${batchId}/decide`, { decision: "approved" }); expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    expect((await statusOf()).toLowerCase()).toBe("approved");
  });
  await S.run(8, "PM opens Payroll directly -> no access", async () => {
    expect((await raw(PM, "GET", "/payroll/batches/all")).status).toBe(403);
  });
  S.done();
});
