// LC-120 Pre-Construction gates C1-C5. Reference: qa/spec/lifecycle.md section 3.
import { createProject, api, raw, view, gateState, expectBlocked, advance, staff, addDoc, upload, steps, expect, test,
  PM, ENG, SITE, FIN, HR, IT, today, plus, uid } from "../../src/kit.js";
import { session } from "../../src/api.js";

test("LC-120 Pre-Construction gates C1-C5", async () => {
  const S = steps("LC-120");
  const p = await createProject({ phase: "Pre-Construction", creator: PM, noSite: true, name: `QA precon ${uid()}` });
  await staff(p, ENG, "engineer");
  const fin = await session(FIN);
  const reqs: number[] = [];
  const draftReq = async (role: string, category: string) => {
    const f = await upload(role, `${p.code}-${category}.pdf`);
    const r = await raw(role, "POST", "/requirements", { title: `${category} requirement - ${p.code}`, project: p.code, category, description: `${category} requirement for the QA project, grades and quantities.`,
      attachments: [{ url: f.url, filename: f.filename, contentType: f.contentType, sizeBytes: f.sizeBytes ?? 100 }], createdBy: (await session(role)).name });
    return r;
  };
  await S.run(1, "Engineer drafts Materials and Specifications requirements -> Draft", async () => {
    for (const c of ["Materials", "Specifications"]) {
      const r = await draftReq(ENG, c); expect(r.ok, `${c}: ${r.status} ${r.body?.message}`).toBe(true);
      expect(String(r.data.status)).toBe("Draft"); reqs.push(r.data.id);
    }
  });
  await S.run(2, "Site Personnel drafts a requirement -> allowed; appears for the PM", async () => {
    await staff(p, SITE, "site-personnel");
    const r = await draftReq(SITE, "Materials"); expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    reqs.push(r.data.id);
    const list = await api<any[]>(PM, "GET", "/requirements");
    expect(list.some((x) => x.id === r.data.id), "the draft is not visible to the PM").toBe(true);
  });
  await S.run(3, "C1 fails with any Draft; passes after the PM approves them", async () => {
    expect(gateState(await view(p), "C1")?.passed, "C1 passed with Draft requirements").toBe(false);
    for (const id of reqs) await api(PM, "PATCH", `/requirements/${id}`, { status: "Approved" });
    expect(gateState(await view(p), "C1")?.passed).toBe(true);
  });
  await S.run(4, "Finance creates budget lines and approves them -> C2 only when all approved and total > 0", async () => {
    const b = await api<{ id: number }>(FIN, "POST", "/finance/budgets", { project: p.code, category: "Materials", owner: fin.name, planned: 600_000, fiscalYear: today().slice(0, 4) });
    expect(gateState(await view(p), "C2")?.passed, "C2 passed with an unapproved line").toBe(false);
    for (const stage of ["draft", "pending-review", "finance-review", "manager-review"]) await api(FIN, "POST", "/finance/budget-approval-steps/decide", { budgetId: b.id, stage, decision: "approved", actor: fin.name });
    expect(gateState(await view(p), "C2")?.passed).toBe(true);
  });
  const ms: number[] = [];
  await S.run(5, "PM dates milestones; a draft one fails C3, none draft and 1+ active passes", async () => {
    for (let i = 0; i < 2; i++) ms.push((await api<{ id: number }>(PM, "POST", "/milestones", { projectCode: p.code, title: `QA milestone ${i + 1}`, description: "QA", estimatedCompletionDate: plus(50 + i * 20) })).id);
    await api(PM, "PATCH", `/milestones/${ms[0]}`, { status: "active" });
    expect(gateState(await view(p), "C3")?.passed, "C3 passed with a draft milestone").toBe(false);
    await api(PM, "PATCH", `/milestones/${ms[1]}`, { status: "active" });
    expect(gateState(await view(p), "C3")?.passed).toBe(true);
  });
  await S.run(6, "HR confirms crew employee records are Active", async () => {
    const mine = await api<any>(SITE, "GET", "/employees/me");
    expect(mine.status).toBe("Active");
    const hrView = (await api<any[]>(HR, "GET", "/hr/employees")).find((e) => e.email === mine.email);
    expect(hrView?.status, "HR's employee list does not show the crew member as Active").toBe("Active");
  });
  await S.run(7, "IT Designer: each crew member has a login", async () => {
    const mine = await api<any>(SITE, "GET", "/employees/me");
    const user = (await api<any[]>(IT, "GET", "/users")).find((u) => u.email === mine.email);
    expect(user, "no account for the crew member").toBeTruthy();
    expect(user.isActive ?? user.active ?? true).toBe(true);
  });
  await S.run(8, "PM staffs the crew, creates tasks linked to active milestones -> C4", async () => {
    expect(gateState(await view(p), "C4")?.passed).toBe(false);
    const site = await session(SITE);
    for (let i = 0; i < 2; i++) await api(PM, "POST", "/tasks", { taskCode: `TSK-${p.code}-${i + 1}`, projectCode: p.code, title: `QA task ${i + 1}`, description: "QA", priority: "Medium", status: "Pending", progress: 0, dueDate: plus(30 + i), assignedToUserId: site.userId, assignedToName: site.name, milestoneId: ms[i] });
    expect(gateState(await view(p), "C4")?.passed, JSON.stringify(gateState(await view(p), "C4")?.detail)).toBe(true);
  });
  await S.run(9, "PM uploads the Notice to Proceed and sets the site latitude/longitude -> C5", async () => {
    expect(gateState(await view(p), "C5")?.passed).toBe(false);
    await addDoc(PM, p, "Notice to Proceed");
    expect(gateState(await view(p), "C5")?.passed, "C5 passed on the NTP alone, without a site location").toBe(false);
    await api(PM, "PATCH", `/projects/${p.id}`, { siteLatitude: 14.5764, siteLongitude: 121.0851, geofenceRadiusM: 300 });
    expect(gateState(await view(p), "C5")?.passed).toBe(true);
  });
  await S.run(10, "PM Advances -> Construction; progress 30", async () => {
    await advance(p);
    const v = await view(p);
    expect(v.phase).toBe("Construction"); expect(v.progress).toBe(30);
  });
  S.done();
});
