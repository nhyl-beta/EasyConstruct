// LC-150 Closeout gates X1-X5 then Completed; LC-152 Archive rules. Reference: qa/spec/lifecycle.md.
import { createProject, fastForward, api, raw, view, failing, gateState, expectBlocked, advance, staff, addDoc, decide, startWorkflow, createRfi, employeeIdOf, steps, expect, test,
  PM, ADMIN, ARCH, CONS, ENG, SITE, FIN, HR, OWNER, uid, today, type QaProject } from "../../src/kit.js";

test("LC-150 Closeout gates X1-X5 then Completed", async () => {
  const S = steps("LC-150");
  const p = await createProject({ phase: "Closeout", creator: PM, name: `QA closeout ${uid()}` });
  await staff(p, ARCH, "architect"); await staff(p, ENG, "engineer"); await staff(p, SITE, "site-personnel");
  let reportId = 0, batchId = "", wf = 0;
  await S.run(1, "Engineer submits the Final Inspection report -> pending approval", async () => {
    const r = await api<{ id: number; status: string }>(ENG, "POST", "/engineering-reports", { title: `Final inspection - ${p.code}`, type: "Final Inspection", project: p.code, location: "Quezon City", date: today(), engineer: "Paolo Mendoza", description: "Final walkthrough.", findings: "All systems function as designed.", recommendations: "Approve for closeout." });
    reportId = r.id;
    expect(String(r.status).toLowerCase(), "report is not pending approval").toMatch(/pending|submitted|draft|under review/);
    expect(gateState(await view(p), "X1")?.passed).toBe(false);
  });
  await S.run(2, "PM approves the report -> X1", async () => {
    await api(PM, "PATCH", `/engineering-reports/${reportId}`, { status: "Approved" });
    expect(gateState(await view(p), "X1")?.passed).toBe(true);
  });
  await S.run(3, "PM uploads the Certificate of Completion -> X2", async () => {
    expect(gateState(await view(p), "X2")?.passed).toBe(false);
    await addDoc(PM, p, "Certificate of Completion");
    expect(gateState(await view(p), "X2")?.passed).toBe(true);
  });
  await S.run(4, "HR builds and submits a payroll batch -> pending", async () => {
    const emp = await employeeIdOf(SITE);
    const r = await raw(HR, "POST", "/payroll/generate", { period: `Closeout ${p.code}`, projectCode: p.code, entries: [{ employeeId: emp, hoursWorked: 64 }], submit: true });
    expect(r.ok, `payroll generate failed: ${r.status} ${r.body?.message}`).toBe(true);
    batchId = String(r.data?.batch?.id ?? r.data?.id);
    expect(gateState(await view(p), "X3")?.passed, "X3 passed with a pending batch").toBe(false);
  });
  await S.run(5, "Finance approves the batch -> X3", async () => {
    const r = await raw(FIN, "POST", `/finance/payroll-review/${batchId}/decide`, { decision: "approved", reviewedBy: "Carlo Ramos" });
    expect(r.ok, `decide failed: ${r.status} ${r.body?.message}`).toBe(true);
    expect(gateState(await view(p), "X3")?.passed).toBe(true);
  });
  await S.run(6, "PM cannot start the Project Closeout workflow", async () => {
    const r = await startWorkflow(PM, "Project Closeout", p);
    expect(r.ok, `PM started the Closeout workflow (${r.status})`).toBe(false);
  });
  await S.run(7, "Engineer starts it; a second one cannot start at the same time", async () => {
    const r = await startWorkflow(ENG, "Project Closeout", p);
    expect(r.ok, `Engineer could not start it: ${r.status} ${r.body?.message}`).toBe(true);
    wf = r.data.id;
    const again = await startWorkflow(ENG, "Project Closeout", p);
    expect(again.ok, "a second Closeout workflow was allowed").toBe(false);
  });
  await S.run(9, "Finance approves its stage -> moves to PM", async () => {
    const r = await decide(wf, "finance-manager", FIN);
    expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
  });
  await S.run(10, "PM approves -> moves to Admin", async () => {
    const r = await decide(wf, "project-manager", PM);
    expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
  });
  await S.run(11, "Admin approves the final stage -> X4", async () => {
    const r = await decide(wf, "admin", ADMIN);
    expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    expect(gateState(await view(p), "X4")?.passed).toBe(true);
  });
  let rfiId = 0;
  await S.run(12, "An RFI left open fails X5", async () => {
    const r = await createRfi(p, PM, ARCH);
    expect(r.ok, `RFI create: ${r.status} ${r.body?.message}`).toBe(true);
    rfiId = r.data.id;
    expect(String(r.data.status), "an RFI raised by the PM is open straight away").toMatch(/open/i);
    expect(gateState(await view(p), "X5")?.passed, "X5 passed with an open RFI").toBe(false);
  });
  await S.run(13, "Architect answers the RFI -> X5 passes", async () => {
    const r = await raw(ARCH, "POST", `/design-requests/${rfiId}/respond`, { responseText: "Detail confirmed as drawn." });
    expect(r.ok, `respond: ${r.status} ${r.body?.message}`).toBe(true);
    expect(gateState(await view(p), "X5")?.passed).toBe(true);
  });
  await S.run(14, "PM Advances to Completed at 100%; Owner notified", async () => {
    const v0 = await view(p);
    test.info().annotations.push({ type: "remark", description: `gates at this point: ${v0.checks.map((c) => `${c.key}:${c.passed ? "ok" : "--"}`).join(" ")}` });
    await advance(p);
    const v = await view(p);
    expect(v.phase).toBe("Completed"); expect(v.progress).toBe(100);
    expect(JSON.stringify(await api(OWNER, "GET", "/notifications")), "Owner was not notified").toContain(p.code);
  });
  await S.run(15, "Owner opens the closeout summary", async () => {
    const r = await raw(OWNER, "GET", `/projects/${p.id}/lifecycle/closeout-summary`);
    expect(r.ok, `closeout summary: ${r.status} ${r.body?.message}`).toBe(true);
  });
  S.done();
});

test("LC-152 Archive is Admin-only and only from Completed", async () => {
  const S = steps("LC-152");
  const done = await createProject({ phase: "Completed", creator: PM, name: `QA archive ${uid()}` });
  const running = await createProject({ phase: "Construction", creator: PM, name: `QA notyet ${uid()}` });
  await S.run(1, "PM archive attempt -> 403", async () => {
    expect((await raw(PM, "POST", `/projects/${done.id}/lifecycle/archive`, {})).status).toBe(403);
  });
  await S.run(2, "Admin cannot archive a project in Construction", async () => {
    const r = await raw(ADMIN, "POST", `/projects/${running.id}/lifecycle/archive`, {});
    expect(r.status, `archive from Construction returned ${r.status}`).toBe(409);
    expect((await view(running)).phase).toBe("Construction");
  });
  await S.run(4, "Admin archives it -> Archived, progress stays 100", async () => {
    const r = await raw(ADMIN, "POST", `/projects/${done.id}/lifecycle/archive`, {});
    expect(r.ok, `archive: ${r.status} ${r.body?.message}`).toBe(true);
    const v = await view(done, ADMIN);
    expect(v.phase).toBe("Archived"); expect(v.progress).toBe(100);
  });
  S.done();
});
