// LC-100 driven through the UI: project wizard, proposal form, approvals pages, document upload, Advance button.
// State is read back through the API (read-only) to confirm what the UI did.
import { expect, test } from "@playwright/test";
import { api, gateState, steps, view, PM, ADMIN } from "../../src/kit.js";
import { pdfBytes } from "../../src/kit.js";
import { advanceViaUi, asRole, choose, clickApprove, findApprove, settle, uploadDocument } from "./ui-kit.js";

test("LC-100 [ui] (UI) Proposal gates P1-P5, then Advance to Design", async ({ browser }) => {
  test.setTimeout(300_000);
  const S = steps("LC-100");
  const n = Date.now().toString(36).slice(-5).toUpperCase();
  const name = `QA UI Proposal ${n}`, code = `QA-UI-${n}`;
  const pm = await asRole(browser, "Project Manager"), arch = await asRole(browser, "Architect"), cons = await asRole(browser, "Consultant");
  let p!: { id: number; code: string };
  const pv = () => view(p, PM);

  await S.run(1, "PM creates a Construction project in the New project wizard -> created in Proposal", async () => {
    const pg = pm.page;
    await pg.goto("/projects/create"); await settle(pg);
    await pg.getByPlaceholder("e.g. Westgate Commercial Tower").fill(name); await pg.getByPlaceholder("e.g. WGT-2025-001").fill(code);
    await pg.getByRole("combobox").filter({ hasText: "Select a client" }).first().click(); await pg.getByRole("option", { name: /Add new client/ }).click();
    await pg.getByPlaceholder("New client name").fill(`QA Client ${n}`); await pg.getByPlaceholder("client@company.com").fill(`client${n}@example.com`);
    await pg.getByRole("button", { name: /^Add$/ }).click(); await pg.waitForTimeout(700);
    await choose(pg, pg, "Select project type", /./); await choose(pg, pg, "Select contract type", /./);
    await pg.getByPlaceholder("Enter project location").fill("Quezon City");
    await pg.getByPlaceholder("Select start date").fill("2026-11-10"); await pg.getByPlaceholder("Select due date").fill("2027-06-30");
    await pg.getByPlaceholder(/Brief description/).fill("Created through the UI by the QA suite.");
    await pg.getByRole("button", { name: /Next/ }).click(); await pg.waitForTimeout(800);            // Scope & schedule
    await pg.getByPlaceholder(/Describe the full scope/).fill("Full scope of work for the QA project.").catch(() => {});
    await pg.getByRole("button", { name: /Next/ }).click(); await pg.waitForTimeout(800);            // Budget & financials
    await pg.getByPlaceholder("0.00").first().fill("1000000").catch(() => {});
    await pg.getByRole("button", { name: /Next/ }).click(); await pg.waitForTimeout(800);            // Team & stakeholders
    await choose(pg, pg, "Select architect", /Ana Villanueva/); await choose(pg, pg, "Select consultant", /Elena Bautista/);
    for (let i = 0; i < 3; i++) {
      const done = pg.getByRole("button", { name: /^(create project|create|submit|finish|save)/i }).last();
      if (await done.count()) { await done.click(); break; }
      await pg.getByRole("button", { name: /Next/ }).click(); await pg.waitForTimeout(800);
    }
    await pg.waitForTimeout(2500);
    const found = (await api<any[]>(ADMIN, "GET", "/projects")).find((x) => x.code === code);
    expect(found, `project ${code} was not created (page: ${pg.url()}; messages: ${(await pg.locator("[role=alert],[data-slot=form-message]").allInnerTexts()).join(" | ").slice(0, 160)})`).toBeTruthy();
    p = { id: found.id, code };
    const v = await pv();
    expect(v.phase).toBe("Proposal");
    expect(v.progress, `new project starts at ${v.progress}% (P1 and P2 already pass because the wizard requires an architect and consultant)`).toBe(0);
  });

  await S.run(2, "Advance is not possible yet: button disabled and the failing checks are listed", async () => {
    const pg = pm.page;
    await pg.goto(`/projects/${p.id}`); await settle(pg, 1800);
    await expect(pg.getByRole("button", { name: /^Advance to Design/ })).toBeDisabled();
    const text = await pg.locator("body").innerText();
    for (const label of ["Proposal submitted", "Proposal approved", "Award & contract on file"]) expect(text, `check '${label}' not listed`).toContain(label);
  });
  await S.run(3, "Architect's dashboard 'Waiting on you' shows the Architect's check", async () => {
    const pg = arch.page; await pg.goto("/dashboard"); await settle(pg, 1800);
    const text = await pg.locator("body").innerText();
    expect(text, "no 'Waiting on you' section on the Architect dashboard").toMatch(/waiting on you/i);
    const mine = (await api<any[]>("Architect", "GET", "/lifecycle/my-actions")).some((m) => m.projectCode === code);
    expect(text, `project ${code} is not among the Architect's waiting items on the dashboard (the API ${mine ? "does list" : "does not list"} it in my-actions)`).toContain(code);
  });
  await S.run(4, "Architect and Consultant are staffed (done in the wizard) -> P1 and P2 pass", async () => {
    const v = await pv();
    expect(gateState(v, "P1")?.passed).toBe(true); expect(gateState(v, "P2")?.passed).toBe(true);
  });
  await S.run(5, "Architect submits a proposal in the New Proposal form -> workflow starts, P3 passes", async () => {
    const pg = arch.page; await pg.goto("/proposals"); await settle(pg);
    await pg.getByRole("button", { name: /^New Proposal/ }).click(); await pg.waitForTimeout(700);
    await pg.getByPlaceholder("Structural Design Proposal").fill(`${name} proposal`);
    await pg.getByRole("combobox").filter({ hasText: "Select a project" }).first().click();
    await pg.getByRole("option", { name: new RegExp(code) }).first().click().catch(async () => { await pg.getByRole("option", { name: new RegExp(name) }).first().click(); });
    await pg.getByPlaceholder("₱500,000").fill("1000000");
    await pg.getByPlaceholder(/Describe the proposal/).fill("Design proposal created through the UI.");
    await pg.getByRole("button", { name: /^Submit & start design/ }).click(); await pg.waitForTimeout(2500);
    expect(gateState(await pv(), "P3")?.passed, "P3 still failing after submitting").toBe(true);
  });
  const wf = async () => (await api<any[]>(PM, "GET", "/workflows")).find((w) => w.projectCode === code);
  const stageNow = async () => { const w = await wf(); return (await api<any>(PM, "GET", `/workflows/${w.id}`)).stages.find((s: any) => s.status === "current")?.role; };
  await S.run(6, "Architect approves the Architect stage -> Consultant stage", async () => {
    const pg = arch.page; await pg.goto("/approvals"); await settle(pg, 1800);
    const btn = await findApprove(pg, code);
    if (!btn) throw new Error(`nothing to approve for the Architect: the Architect stage was already approved on submission (current stage: ${await stageNow()})`);
    await btn.click(); await pg.waitForTimeout(1200);
    expect(await stageNow()).toBe("consultant");
  });
  await S.run(7, "Consultant approves the Consultant stage -> PM stage", async () => {
    const pg = cons.page; await pg.goto("/consultant/proposals"); await settle(pg, 1500);
    await pg.getByRole("tab", { name: /Workflow approvals/ }).click(); await pg.waitForTimeout(1200);
    await clickApprove(pg, code, "the Consultant's Workflow approvals tab");
    expect(await stageNow()).toBe("project-manager");
  });
  await S.run(8, "PM approves the last stage -> workflow completed, P4 passes", async () => {
    const pg = pm.page; await pg.goto("/approvals"); await settle(pg, 1800);
    await clickApprove(pg, code, "the PM's Approvals page");
    expect(gateState(await pv(), "P4")?.passed).toBe(true);
  });
  await S.run(9, "PM uploads Notice of Award and Contract in the Upload dialog -> P5, progress 10%", async () => {
    const pg = pm.page;
    for (const type of ["Notice of Award", "Contract"]) {
      await uploadDocument(pg, code, type);
      if (type === "Notice of Award") expect(gateState(await pv(), "P5")?.passed, "P5 passed on the Notice of Award alone (or the upload failed)").toBe(false);
    }
    const v = await pv();
    expect(gateState(v, "P5")?.passed, `P5 still failing after both uploads (${gateState(v, "P5")?.detail})`).toBe(true);
    expect(v.progress, `progress ${v.progress}, expected 10`).toBe(10);
  });
  await S.run(10, "PM clicks Advance to Design -> phase Design; history row written", async () => {
    await advanceViaUi(pm.page, p.id, "Design");
    const v = await pv();
    expect(v.phase).toBe("Design");
    expect(v.history.some((h) => h.fromStatus === "Proposal" && h.toStatus === "Design")).toBe(true);
  });
  for (const c of [pm, arch, cons]) await c.context.close();
  S.done();
});
