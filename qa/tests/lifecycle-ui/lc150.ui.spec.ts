// LC-150 with the UI steps a person does: PM uploads the Certificate of Completion, Finance / PM / Admin approve the Closeout
// workflow, PM clicks Advance to Completed, Owner opens the closeout summary. The Final Inspection report, payroll batch, workflow
// start and RFI answer are done through the API (their screens are not driven here).
import { expect, test } from "@playwright/test";
import { api, createProject, createRfi, employeeIdOf, gateState, raw, staff, startWorkflow, steps, uid, view, today, ADMIN, ARCH, ENG, FIN, HR, OWNER, PM, SITE } from "../../src/kit.js";
import { advanceViaUi, asRole, clickApprove, settle, uploadDocument } from "./ui-kit.js";

test("LC-150 [ui] (UI) Closeout gates X1-X5, then Completed", async ({ browser }) => {
  test.setTimeout(300_000);
  const S = steps("LC-150");
  const p = await createProject({ phase: "Closeout", creator: PM, name: `QA UI closeout ${uid()}` });
  await staff(p, ARCH, "architect"); await staff(p, ENG, "engineer"); await staff(p, SITE, "site-personnel");
  const pm = await asRole(browser, "Project Manager"), fin = await asRole(browser, "Finance Manager"), adm = await asRole(browser, "Admin"), own = await asRole(browser, "Owner");
  const pv = () => view(p, PM);
  // API setup: Final Inspection approved (X1), payroll approved (X3), Closeout workflow started by the Engineer
  const rep = await api<{ id: number }>(ENG, "POST", "/engineering-reports", { title: `Final inspection - ${p.code}`, type: "Final Inspection", project: p.code, location: "Quezon City", date: today(), engineer: "Paolo Mendoza", description: "Final walkthrough.", findings: "All systems function as designed.", recommendations: "Approve for closeout." });
  await api(PM, "PATCH", `/engineering-reports/${rep.id}`, { status: "Approved" });
  const emp = await employeeIdOf(SITE);
  const pay = await raw(HR, "POST", "/payroll/generate", { period: `UI closeout ${p.code}`, projectCode: p.code, entries: [{ employeeId: emp, hoursWorked: 64 }], submit: true });
  await raw(FIN, "POST", `/finance/payroll-review/${pay.data.batch.id}/decide`, { decision: "approved" });
  const wf = await startWorkflow(ENG, "Project Closeout", p);
  expect(wf.ok, `Closeout workflow start: ${wf.status}`).toBe(true);

  await S.run(3, "PM uploads the Certificate of Completion in the Upload dialog -> X2", async () => {
    expect(gateState(await pv(), "X2")?.passed).toBe(false);
    await uploadDocument(pm.page, p.code, "Certificate of Completion");
    expect(gateState(await pv(), "X2")?.passed, "X2 still failing after the upload").toBe(true);
  });
  await S.run(9, "Finance approves its Closeout stage on the Approvals page -> moves to PM", async () => {
    await fin.page.goto("/approvals"); await settle(fin.page, 1800);
    await clickApprove(fin.page, p.code, "the Finance Manager's Approvals page");
    const w = await api<any>(PM, "GET", `/workflows/${wf.data.id}`);
    expect(w.stages.find((s: any) => s.status === "current")?.role).toBe("project-manager");
  });
  await S.run(10, "PM approves on the Approvals page -> moves to Admin", async () => {
    await pm.page.goto("/approvals"); await settle(pm.page, 1800);
    await clickApprove(pm.page, p.code, "the PM's Approvals page");
    const w = await api<any>(PM, "GET", `/workflows/${wf.data.id}`);
    expect(w.stages.find((s: any) => s.status === "current")?.role).toBe("admin");
  });
  await S.run(11, "Admin approves the final stage in the UI -> X4", async () => {
    await adm.page.goto("/admin/workflows"); await settle(adm.page, 1800);
    await clickApprove(adm.page, p.code, "the Admin's Workflows page");
    expect(gateState(await pv(), "X4")?.passed, "X4 still failing after the Admin's approval").toBe(true);
  });
  // X5: no open RFI/RFA (raised and answered through the API)
  const rfi = await createRfi(p, PM, ARCH);
  await raw(ARCH, "POST", `/design-requests/${rfi.data.id}/respond`, { responseText: "Confirmed as drawn." });
  await S.run(14, "PM clicks Advance to Completed -> Completed at 100%", async () => {
    await advanceViaUi(pm.page, p.id, "Completed");
    const v = await pv();
    expect(v.phase, `phase ${v.phase}; open gates: ${v.checks.filter((c) => !c.passed).map((c) => c.key).join(",")}`).toBe("Completed");
    expect(v.progress).toBe(100);
  });
  await S.run(15, "Owner opens the closeout summary", async () => {
    const pg = own.page; await pg.goto("/owner/portfolio"); await settle(pg, 1500);
    await pg.getByPlaceholder(/search/i).last().fill(p.code).catch(() => {}); await pg.waitForTimeout(900);
    await pg.getByText(p.code).first().click(); await settle(pg, 2000);
    expect(await pg.locator("body").innerText(), "no closeout summary on the project page the Owner opened").toMatch(/closeout summary/i);
  });
  for (const c of [pm, fin, adm, own]) await c.context.close();
  S.done();
});
