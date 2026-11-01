// Lifecycle cases LC-100, 101, 110, 120, 131, 136 (file 02). Reference: qa/spec/lifecycle.md.
// Each CSV step is a test.step titled "LC-xxx step n ..."; the gate under test is built with real API calls and shown
// failing (409) before it passes. Earlier phases of a case's project are reached with the documented Admin override
// (recorded in phase history) so a case never depends on shared demo projects.
import { createProject, api, raw, view, failing, gateState, expectBlocked, advance, staff, addDoc, upload, proposalWorkflow, decide, steps, expect, test,
  PM, ADMIN, ARCH, CONS, ENG, SITE, FIN, HR, OWNER, IT, today, plus, uid, type QaProject } from "../../src/kit.js";
import { session } from "../../src/api.js";

const approxEq = (a: number, b: number) => Math.abs(a - b) < 0.0001;

test("LC-100 Proposal gates P1-P5 block, then pass, then Advance to Design", async () => {
  const S = steps("LC-100");
  let p!: QaProject;
  let wf = 0;
  await S.run(1, "PM creates a Construction project", async () => {
    p = await createProject({ creator: PM, name: `QA proposal ${uid()}` });
    const v = await view(p);
    expect(v.phase).toBe("Proposal");
    expect(v.progress, "new project starts at 0%").toBe(0);
  });
  await S.run(2, "Advance with nothing done -> 409 listing P1-P5", async () => {
    const keys = await expectBlocked(p);
    const v = await view(p);
    expect(failing(v), "all five Proposal gates fail on a new project").toEqual(["P1", "P2", "P3", "P4", "P5"]);
    expect(keys.sort(), "409 body names the failing checks").toEqual(["P1", "P2", "P3", "P4", "P5"]);
    for (const c of v.checks) { expect(c.ownerRoles?.length, `${c.key} has an owner role`).toBeGreaterThan(0); expect(c.link, `${c.key} has a link`).toBeTruthy(); }
  });
  await S.run(3, "Architect 'Waiting on you' shows checks owned by the Architect", async () => {
    const mine = await api<{ projectCode: string; title: string; kind: string }[]>(ARCH, "GET", "/lifecycle/my-actions");
    const own = mine.filter((m) => m.projectCode === p.code);
    expect(own.length, "my-actions for the Architect does not list this project").toBeGreaterThan(0);
    expect(own.map((m) => m.title).join(" | "), "the Architect-owned check P3 is missing").toMatch(/Proposal submitted/);
  });
  await S.run(4, "PM staffs an Architect (P1) and a Consultant (P2)", async () => {
    await staff(p, ARCH, "architect"); await staff(p, CONS, "consultant");
    const v = await view(p);
    expect(gateState(v, "P1")?.passed).toBe(true); expect(gateState(v, "P2")?.passed).toBe(true);
  });
  const current = async () => (await api<{ stages: { role: string; status: string }[] }>(PM, "GET", `/workflows/${wf}`)).stages.find((s) => s.status === "current")?.role;
  await S.run(5, "Architect submits a proposal; workflow starts; P3 passes", async () => {
    wf = await proposalWorkflow(p);
    expect(gateState(await view(p), "P3")?.passed).toBe(true);
    test.info().annotations.push({ type: "remark", description: `workflow stage after submit: ${await current()}` });
    expect(gateState(await view(p), "P4")?.passed, "P4 stays closed until the workflow completes").toBe(false);
  });
  await S.run(6, "Architect approves the Architect stage -> Consultant stage", async () => {
    const r = await decide(wf, "architect", ARCH);
    expect(r.ok, `approve failed ${r.status} ${r.body?.message}`).toBe(true);
    expect(await current()).toBe("consultant");
  });
  await S.run(7, "Consultant approves -> PM stage", async () => {
    const r = await decide(wf, "consultant", CONS);
    expect(r.ok, `approve failed ${r.status} ${r.body?.message}`).toBe(true);
    expect(await current()).toBe("project-manager");
  });
  await S.run(8, "PM approves the last stage -> workflow completed, P4 passes", async () => {
    const r = await decide(wf, "project-manager", PM);
    expect(r.ok, `approve failed ${r.status} ${r.body?.message}`).toBe(true);
    expect(gateState(await view(p), "P4")?.passed).toBe(true);
    const w = await api<{ status: string }>(PM, "GET", `/workflows/${wf}`);
    expect(String(w.status).toLowerCase()).toBe("completed");
    const props = await api<any[]>(PM, "GET", "/proposals");
    const prop = props.find((x) => x.projectCode === p.code);
    expect(String(prop?.status).toLowerCase(), "proposal status follows the workflow").toMatch(/approved|completed/);
  });
  await S.run(9, "PM uploads Notice of Award and Contract (value > 0) -> P5, progress 10%", async () => {
    await addDoc(PM, p, "Notice of Award");
    expect(gateState(await view(p), "P5")?.passed, "Notice of Award alone must not open P5").toBe(false);
    await addDoc(PM, p, "Contract");
    const v = await view(p);
    expect(gateState(v, "P5")?.passed).toBe(true);
    expect(v.progress, "all five gates pass -> top of the Proposal band").toBe(10);
  });
  await S.run(10, "PM Advances -> Design; history row; members and PM notified", async () => {
    await advance(p);
    const v = await view(p);
    expect(v.phase).toBe("Design");
    expect(v.history.some((h) => h.fromStatus === "Proposal" && h.toStatus === "Design"), "phase history row not written").toBe(true);
    const note = JSON.stringify(await api(ARCH, "GET", "/notifications"));
    expect(note, "Architect was not notified of the phase change").toContain(p.code);
  });
  S.done();
});

test("LC-101 Who may Advance, and the Admin override rules", async () => {
  const S = steps("LC-101");
  const p = await createProject({ creator: PM, name: `QA advance ${uid()}` });
  await S.run(1, "A PM not assigned to the project cannot Advance", async () => {
    const r = await raw("Project Manager (other)", "POST", `/projects/${p.id}/lifecycle/advance`, {});
    expect([403, 404], `other PM got ${r.status}`).toContain(r.status);
  });
  await S.run(2, "Engineer Advance API -> 403", async () => {
    expect((await raw(ENG, "POST", `/projects/${p.id}/lifecycle/advance`, {})).status).toBe(403);
  });
  await S.run(3, "Admin override with a 9-character reason is rejected", async () => {
    const r = await raw(ADMIN, "POST", `/projects/${p.id}/lifecycle/advance`, { override: true, reason: "123456789" });
    expect(r.ok, `9-char reason was accepted (${r.status})`).toBe(false);
    expect(String(r.body?.message)).toMatch(/10/);
    expect((await view(p)).phase).toBe("Proposal");
  });
  await S.run(4, "Admin override with 10+ characters advances; history has override=true and a gate snapshot", async () => {
    const r = await raw(ADMIN, "POST", `/projects/${p.id}/lifecycle/advance`, { override: true, reason: "QA override reason" });
    expect(r.ok, `override failed ${r.status} ${r.body?.message}`).toBe(true);
    const v = await view(p);
    expect(v.phase).toBe("Design");
    const h = v.history.find((x) => x.override === true || x.isOverride === true);
    expect(h, "no history row with override=true").toBeTruthy();
    expect(JSON.stringify(h), "history row carries no gate snapshot").toMatch(/snapshot|checks|gate/i);
  });
  await S.run(5, "Owner audit trail shows the override with reason and actor", async () => {
    const logs = JSON.stringify(await api(OWNER, "GET", "/audit-logs"));
    expect(logs, "override not in the audit log").toContain("QA override reason");
  });
  S.done();
});

test("LC-110 Design gates D1-D3 (Construction)", async () => {
  const S = steps("LC-110");
  const p = await createProject({ phase: "Design", creator: PM, name: `QA design ${uid()}` });
  await staff(p, ARCH, "architect"); await staff(p, CONS, "consultant");
  let designId = 0, reviewId = 0;
  await S.run(1, "PM staffs an Engineer", async () => {
    await staff(p, ENG, "engineer");
    const members = JSON.stringify(await api(PM, "GET", `/project-members?projectCode=${p.code}`));
    expect(members).toContain("engineer");
  });
  await S.run(2, "Architect assigns a design with files to the staffed Engineer -> D1", async () => {
    expect(gateState(await view(p), "D1")?.passed).toBe(false);
    const eng = await session(ENG), arch = await session(ARCH);
    const a = await upload(ARCH, `${p.code}-plan.png`, "png"), b = await upload(ARCH, `${p.code}-design.pdf`);
    const d = await api<{ id: number }>(ARCH, "POST", "/designs", { code: `DSN-${p.code}`, name: `${p.code} structural`, projectCode: p.code, discipline: "Structural", category: "Structural", leadArchitect: arch.name,
      fileUrls: [{ name: a.filename, url: a.url }, { name: b.filename, url: b.url }], assignedEngineers: [{ userId: eng.userId, userName: eng.name }] });
    designId = d.id;
    expect(gateState(await view(p), "D1")?.passed).toBe(true);
  });
  await S.run(3, "A review left Pending keeps D2 failing", async () => {
    const r = await api<{ id: number }>(CONS, "POST", "/design-reviews", { code: `REV-${p.code}`, designId, requestedBy: (await session(ARCH)).name });
    reviewId = r.id;
    expect(gateState(await view(p), "D2")?.passed, "D2 passed with a Pending review").toBe(false);
  });
  await S.run(4, "Consultant approves every review -> D2", async () => {
    await api(CONS, "POST", `/design-reviews/${reviewId}/decide`, { decision: "Approved" });
    expect(gateState(await view(p), "D2")?.passed).toBe(true);
  });
  await S.run(5, "Architect uploads an approved, current blueprint -> D3", async () => {
    expect(gateState(await view(p), "D3")?.passed).toBe(false);
    await api(ARCH, "POST", "/blueprints", { drawingNumber: `BP-${p.code}`, title: `${p.code} drawings`, folder: "Structural", discipline: "Structural", scale: "1:100", revision: "A", author: (await session(ARCH)).name, approval: "Approved", status: "Current", fileType: "PDF", sizeKb: 1, projectCode: p.code, designId });
    expect(gateState(await view(p), "D3")?.passed).toBe(true);
  });
  await S.run(6, "PM Advances -> Pre-Construction; progress inside 25-30", async () => {
    await advance(p);
    const v = await view(p);
    expect(v.phase).toBe("Pre-Construction");
    expect(v.progress).toBeGreaterThanOrEqual(25); expect(v.progress).toBeLessThanOrEqual(30);
  });
  await S.run(7, "Engineer's project list shows the project as assigned", async () => {
    const list = await api<any[]>(ENG, "GET", "/projects");
    expect(list.some((x) => x.code === p.code), "project not visible to the staffed Engineer").toBe(true);
  });
  S.done();
});

/** A project in Construction with a staffed site worker, `n` tasks and the given milestones. */
async function constructionProject(name: string, opts: { tasks: number; milestones: ("active" | "draft" | "cancelled")[] }) {
  const p = await createProject({ phase: "Construction", creator: PM, name });
  await staff(p, SITE, "site-personnel"); await staff(p, ENG, "engineer");
  const site = await session(SITE);
  const ms: { id: number; status: string }[] = [];
  for (const [i, st] of opts.milestones.entries()) {
    const m = await api<{ id: number }>(PM, "POST", "/milestones", { projectCode: p.code, title: `QA milestone ${i + 1}`, description: "QA", estimatedCompletionDate: plus(40 + i * 10) });
    if (st !== "draft") await api(PM, "PATCH", `/milestones/${m.id}`, { status: st === "cancelled" ? "cancelled" : "active" });
    ms.push({ id: m.id, status: st });
  }
  const tasks: number[] = [];
  const live = ms.filter((m) => m.status === "active");
  for (let i = 0; i < opts.tasks; i++) {
    const t = await api<{ id: number }>(PM, "POST", "/tasks", { taskCode: `TSK-${p.code}-${i + 1}`, projectCode: p.code, title: `QA task ${i + 1}`, description: "QA", priority: "Medium", status: "Pending", progress: 0, dueDate: plus(30 + i), assignedToUserId: site.userId, assignedToName: site.name, ...(live.length ? { milestoneId: live[i % live.length]!.id } : {}) });
    tasks.push(t.id);
  }
  return { p, ms, tasks };
}
async function completeTask(id: number) {
  const f = await upload(SITE, `evidence-${id}.png`, "png");
  await raw(SITE, "PATCH", `/tasks/${id}/status`, { status: "In Progress" });
  return raw(SITE, "PATCH", `/tasks/${id}/status`, { status: "Completed", completionNote: "Done and checked.", completionFileUrl: f.url });
}

test("LC-131 Construction progress = 30 + 65 x done / (tasks + live milestones)", async () => {
  const S = steps("LC-131");
  let ctx!: Awaited<ReturnType<typeof constructionProject>>;
  const units = () => 4 + 2; // 4 tasks + 2 live milestones; the draft and cancelled milestone are excluded
  const oracle = (done: number) => 30 + (65 * done) / units();
  await S.run(1, "Set up 4 tasks and 2 live milestones plus a draft and a cancelled one", async () => {
    ctx = await constructionProject(`QA progress ${uid()}`, { tasks: 4, milestones: ["active", "active", "draft", "cancelled"] });
  });
  await S.run(2, "0 done -> 30 (draft and cancelled milestones not counted)", async () => {
    expect((await view(ctx.p)).progress).toBe(30);
  });
  await S.run(3, "Site completes 2 tasks -> equals the independent calculation", async () => {
    // tasks 1 and 3 are the ones linked to the first milestone (the app refuses to complete a milestone before its linked tasks)
    for (const t of [ctx.tasks[0]!, ctx.tasks[2]!]) { const r = await completeTask(t); expect(r.ok, `complete task: ${r.status} ${r.body?.message}`).toBe(true); }
    const got = (await view(ctx.p)).progress;
    expect(got, `progress ${got}, expected ${Math.round(oracle(2))} (30 + 65 x 2/6 = ${oracle(2).toFixed(2)})`).toBe(Math.round(oracle(2)));
  });
  await S.run(4, "Engineer marks 1 milestone completed -> equals the independent calculation", async () => {
    const r = await raw(ENG, "PATCH", `/milestones/${ctx.ms[0]!.id}`, { status: "completed" });
    expect(r.ok, `Engineer milestone completion: ${r.status} ${r.body?.message}`).toBe(true);
    const got = (await view(ctx.p)).progress;
    expect(got, `progress ${got}, expected ${Math.round(oracle(3))} (30 + 65 x 3/6 = ${oracle(3).toFixed(2)})`).toBe(Math.round(oracle(3)));
  });
  await S.run(5, "Owner Portfolio shows the same percentage", async () => {
    const want = (await view(ctx.p)).progress;
    const row = (await api<any[]>(OWNER, "GET", "/projects")).find((x) => x.code === ctx.p.code);
    expect(Number(row?.progress)).toBe(want);
  });
  await S.run(6, "Admin dashboard shows the same percentage", async () => {
    const want = (await view(ctx.p)).progress;
    const row = (await api<any[]>(ADMIN, "GET", "/projects")).find((x) => x.code === ctx.p.code);
    expect(Number(row?.progress)).toBe(want);
  });
  S.done();
});

test("LC-136 Construction exit gates K1-K4 then Advance to Closeout", async () => {
  const S = steps("LC-136");
  const ctx = await constructionProject(`QA exit ${uid()}`, { tasks: 2, milestones: ["active", "active"] });
  await S.run(1, "Advance with an incomplete task -> 409, K1 fails", async () => {
    const keys = await expectBlocked(ctx.p);
    expect(keys).toContain("K1");
    expect(gateState(await view(ctx.p), "K1")?.passed).toBe(false);
  });
  await S.run(2, "Site completes all tasks -> K1 passes", async () => {
    for (const t of ctx.tasks) await completeTask(t);
    expect(gateState(await view(ctx.p), "K1")?.passed).toBe(true);
  });
  await S.run(3, "PM completes or cancels all milestones -> K2 passes", async () => {
    expect(gateState(await view(ctx.p), "K2")?.passed, "K2 passed with open milestones").toBe(false);
    await api(PM, "PATCH", `/milestones/${ctx.ms[0]!.id}`, { status: "completed" });
    await api(PM, "PATCH", `/milestones/${ctx.ms[1]!.id}`, { status: "cancelled" });
    expect(gateState(await view(ctx.p), "K2")?.passed).toBe(true);
  });
  await S.run(4, "K3 and K4 pass with no open issue or active workflow", async () => {
    const v = await view(ctx.p);
    expect(gateState(v, "K3")?.passed).toBe(true); expect(gateState(v, "K4")?.passed).toBe(true);
  });
  await S.run(5, "PM Advances -> Closeout; progress inside 95-99", async () => {
    await advance(ctx.p);
    const v = await view(ctx.p);
    expect(v.phase).toBe("Closeout"); expect(v.progress).toBeGreaterThanOrEqual(95); expect(v.progress).toBeLessThanOrEqual(99);
  });
  S.done();
});
