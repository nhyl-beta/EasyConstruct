// LC-120 with the UI steps a person does: Engineer drafts requirements, PM approves them on the Approvals page,
// PM uploads the Notice to Proceed, PM clicks Advance. Budget lines, milestones, tasks and the site location are set up through the
// API (the budget approval chain and milestone/task screens are not driven here).
import { expect, test } from "@playwright/test";
import { api, createProject, gateState, plus, staff, steps, view, ENG, FIN, PM, SITE, today, uid } from "../../src/kit.js";
import { session } from "../../src/api.js";
import { pdfBytes } from "../../src/kit.js";
import { advanceViaUi, asRole, choose, clickApprove, settle, uploadDocument } from "./ui-kit.js";

test("LC-120 [ui] (UI) Pre-Construction gates C1-C5, then Advance", async ({ browser }) => {
  test.setTimeout(300_000);
  const S = steps("LC-120");
  const p = await createProject({ phase: "Pre-Construction", creator: PM, noSite: true, name: `QA UI precon ${uid()}` });
  await staff(p, ENG, "engineer"); await staff(p, SITE, "site-personnel");
  const eng = await asRole(browser, "Engineer"), pm = await asRole(browser, "Project Manager");
  const pv = () => view(p, PM);

  await S.run(1, "Engineer drafts Materials and Specifications requirements in the form -> saved as Draft", async () => {
    for (const cat of ["Materials", "Specifications"]) {
      const pg = eng.page; await pg.goto("/requirements"); await settle(pg);
      await pg.getByRole("button", { name: /Draft a requirement|New|Add|Create/i }).first().click().catch(() => {});
      await pg.waitForTimeout(700);
      const dlg = pg.getByRole("dialog");
      await dlg.getByLabel("Title").fill(`${cat} requirement - ${p.code}`);
      await choose(pg, dlg, "Select a project", new RegExp(p.code));
      await dlg.getByRole("combobox").filter({ hasText: /^Select$/ }).first().click();
      await pg.getByRole("option", { name: new RegExp(`^${cat}`) }).first().click();
      await dlg.getByLabel("Description").fill(`${cat} requirement for the QA project: grades, quantities and acceptance criteria.`);
      await dlg.locator("input[type=file]").setInputFiles({ name: `${cat}.pdf`, mimeType: "application/pdf", buffer: pdfBytes(cat) });
      await pg.waitForTimeout(800);
      await dlg.getByRole("button", { name: /Save as draft/ }).click(); await pg.waitForTimeout(2000);
    }
    const mine = (await api<any[]>(PM, "GET", "/requirements")).filter((r) => r.project === p.code);
    expect(mine.map((r) => `${r.category}:${r.status}`).sort(), "both requirements saved as Draft").toEqual(["Materials:Draft", "Specifications:Draft"]);
    expect(gateState(await pv(), "C1")?.passed).toBe(false);
  });
  await S.run(3, "C1 fails with Drafts; Engineer submits them, PM approves them on the Approvals page -> C1 passes", async () => {
    const pg = pm.page;
    for (const cat of ["Materials", "Specifications"]) {
      await eng.page.goto("/requirements"); await settle(eng.page);
      const row = eng.page.locator(`xpath=//*[contains(normalize-space(.), "${cat} requirement - ${p.code}") and .//button[contains(normalize-space(.), "Submit for approval")] and not(.//*[contains(normalize-space(.), "${cat} requirement - ${p.code}") and .//button[contains(normalize-space(.), "Submit for approval")]])]`).first();
      await row.getByRole("button", { name: /Submit for approval/ }).click(); await eng.page.waitForTimeout(900);
      const ok = eng.page.locator("[role=alertdialog],[role=dialog]").getByRole("button", { name: /^(submit|confirm|yes)/i }).last();
      if (await ok.count()) await ok.click();
      await eng.page.waitForTimeout(1200);
    }
    expect(gateState(await pv(), "C1")?.passed, "C1 passed while the requirements are only submitted, not approved").toBe(false);
    for (let i = 0; i < 2; i++) { await pg.goto("/approvals"); await settle(pg, 1800); await clickApprove(pg, p.code, "the PM's Approvals page (requirements)"); }
    expect(gateState(await pv(), "C1")?.passed, "C1 still failing after approving both requirements").toBe(true);
  });
  // budget, milestones, tasks: API setup (not UI-driven)
  const fin = await session(FIN), site = await session(SITE);
  const b = await api<{ id: number }>(FIN, "POST", "/finance/budgets", { project: p.code, category: "Materials", owner: fin.name, planned: 500_000, fiscalYear: today().slice(0, 4) });
  for (const stage of ["draft", "pending-review", "finance-review", "manager-review"]) await api(FIN, "POST", "/finance/budget-approval-steps/decide", { budgetId: b.id, stage, decision: "approved", actor: fin.name });
  const ms = (await api<{ id: number }>(PM, "POST", "/milestones", { projectCode: p.code, title: "UI milestone", description: "QA", estimatedCompletionDate: plus(60) })).id;
  await api(PM, "PATCH", `/milestones/${ms}`, { status: "active" });
  await api(PM, "POST", "/tasks", { taskCode: `TSK-${p.code}`, projectCode: p.code, title: "UI task", description: "QA", priority: "Medium", status: "Pending", progress: 0, dueDate: plus(30), assignedToUserId: site.userId, assignedToName: site.name, milestoneId: ms });
  await S.run(9, "PM uploads the Notice to Proceed in the Upload dialog and sets the site location -> C5", async () => {
    await uploadDocument(pm.page, p.code, "Notice to Proceed");
    expect(gateState(await pv(), "C5")?.passed, "C5 passed on the NTP alone, without a site location").toBe(false);
    await api(PM, "PATCH", `/projects/${p.id}`, { siteLatitude: 14.5764, siteLongitude: 121.0851, geofenceRadiusM: 300 });
    expect(gateState(await pv(), "C5")?.passed).toBe(true);
  });
  await S.run(10, "PM clicks Advance to Construction -> phase Construction; progress 30", async () => {
    await advanceViaUi(pm.page, p.id, "Construction");
    const v = await pv();
    expect(v.phase).toBe("Construction"); expect(v.progress).toBe(30);
  });
  for (const c of [eng, pm]) await c.context.close();
  S.done();
});
