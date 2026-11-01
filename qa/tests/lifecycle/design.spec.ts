// LC-170/171/172 Design-type path (plan sets, Turnover). Reference: qa/spec/lifecycle.md sections 2-3.
import { createProject, fastForward, api, raw, view, failing, gateState, expectBlocked, advance, staff, addDoc, upload, decide, startWorkflow, createRfi, steps, expect, test,
  PM, ADMIN, ARCH, CONS, ENG, uid, type QaProject } from "../../src/kit.js";
import { session } from "../../src/api.js";

const POINTS: Record<string, number> = { not_started: 0, in_progress: 40, for_review: 70, approved: 90, issued: 100 };
const planSets = (p: QaProject) => api<{ id: number; discipline: string; status: string; leadUserId: number | null }[]>(PM, "GET", `/deliverables?projectCode=${p.code}`);

test("LC-170 Design-type path gates DP1, DP2, D2, D3, D4", async () => {
  const S = steps("LC-170");
  let p!: QaProject;
  await S.run(1, "PM creates a Design-type project: path is Proposal, Design, Turnover only", async () => {
    p = await createProject({ deliveryType: "Design", disciplines: ["Architectural", "MEP"], phase: "Design", creator: PM, name: `QA design-type ${uid()}` });
    const v = await view(p);
    expect(v.deliveryType).toBe("Design");
    const labels = (v.phasePath ?? []).map((x: any) => x.label).join(" > ");
    expect(labels, `phase path is ${labels}`).toMatch(/^Proposal > Design > Turnover/);
  });
  await S.run(2, "Pre-Construction and Construction are hidden", async () => {
    const path = ((await view(p)).phasePath ?? []).map((x: any) => x.label);
    expect(path.join(","), `phase path shows ${path.join(", ")}`).not.toMatch(/Pre-Construction|Construction/);
  });
  await staff(p, ARCH, "architect"); await staff(p, CONS, "consultant");
  const arch = await session(ARCH);
  await S.run(3, "DP1 fails while a plan set has no lead, passes once every set has one", async () => {
    const sets = await planSets(p);
    expect(sets.length).toBe(2);
    await api(ARCH, "PATCH", `/deliverables/${sets[0]!.id}`, { leadUserId: arch.userId });
    expect(gateState(await view(p), "DP1")?.passed, "DP1 passed with a plan set lacking a lead").toBe(false);
    await api(ARCH, "PATCH", `/deliverables/${sets[1]!.id}`, { leadUserId: arch.userId });
    expect(gateState(await view(p), "DP1")?.passed).toBe(true);
  });
  const designIds: number[] = [];
  await S.run(4, "A design with files on each plan set -> DP2", async () => {
    expect(gateState(await view(p), "DP2")?.passed).toBe(false);
    for (const [i, discipline] of (["Architectural", "MEP"] as const).entries()) {
      const a = await upload(ARCH, `${p.code}-${i}.png`, "png"), b = await upload(ARCH, `${p.code}-${i}.pdf`);
      const d = await api<{ id: number }>(ARCH, "POST", "/designs", { code: `DSN-${p.code}-${i}`, name: `${p.code} ${discipline}`, projectCode: p.code, discipline, category: discipline, leadArchitect: arch.name, fileUrls: [{ name: a.filename, url: a.url }, { name: b.filename, url: b.url }] });
      designIds.push(d.id);
    }
    expect(gateState(await view(p), "DP2")?.passed).toBe(true);
  });
  await S.run(5, "Consultant approves the design reviews -> D2", async () => {
    for (const [i, id] of designIds.entries()) {
      const r = await api<{ id: number }>(CONS, "POST", "/design-reviews", { code: `REV-${p.code}-${i}`, designId: id, requestedBy: arch.name });
      await api(CONS, "POST", `/design-reviews/${r.id}/decide`, { decision: "Approved" });
    }
    expect(gateState(await view(p), "D2")?.passed).toBe(true);
  });
  await S.run(6, "Architect uploads the approved blueprint -> D3", async () => {
    await api(ARCH, "POST", "/blueprints", { drawingNumber: `BP-${p.code}`, title: `${p.code} drawings`, folder: "Architectural", discipline: "Architectural", scale: "1:100", revision: "A", author: arch.name, approval: "Approved", status: "Current", fileType: "PDF", sizeKb: 1, projectCode: p.code, designId: designIds[0] });
    expect(gateState(await view(p), "D3")?.passed).toBe(true);
  });
  await S.run(7, "An open RFI fails D4; answering it passes", async () => {
    const r = await createRfi(p, PM, ARCH);
    expect(r.ok, `RFI: ${r.status} ${r.body?.message}`).toBe(true);
    expect(gateState(await view(p), "D4")?.passed, "D4 passed with an open RFI").toBe(false);
    const ans = await raw(ARCH, "POST", `/design-requests/${r.data.id}/respond`, { responseText: "Confirmed as drawn." });
    expect(ans.ok, `respond: ${ans.status} ${ans.body?.message}`).toBe(true);
    expect(gateState(await view(p), "D4")?.passed).toBe(true);
  });
  await S.run(8, "PM Advances to Turnover (stored Closeout); progress 90-99", async () => {
    await advance(p);
    const v = await view(p);
    expect(v.phase).toBe("Closeout");
    expect(v.progress).toBeGreaterThanOrEqual(90); expect(v.progress).toBeLessThanOrEqual(99);
  });
  S.done();
});

test("LC-171 Plan-set status permissions and progress points", async () => {
  const S = steps("LC-171");
  const p = await createProject({ deliveryType: "Design", disciplines: ["Architectural", "Structural", "MEP", "Civil", "Interior"], phase: "Design", creator: PM, name: `QA planset ${uid()}` });
  await staff(p, ARCH, "architect"); await staff(p, CONS, "consultant");
  const sets = await planSets(p);
  const move = (role: string, id: number, status: string) => raw(role, "PATCH", `/deliverables/${id}`, { status });
  await S.run(1, "Architect moves a plan set to for_review -> allowed", async () => {
    await move(PM, sets[0]!.id, "in_progress");
    const r = await move(ARCH, sets[0]!.id, "for_review");
    expect(r.ok, `Architect -> for_review: ${r.status} ${r.body?.message}`).toBe(true);
  });
  await S.run(2, "Architect moves a plan set to approved -> blocked", async () => {
    const r = await move(ARCH, sets[0]!.id, "approved");
    expect(r.status, `Architect -> approved returned ${r.status}`).toBe(403);
  });
  await S.run(3, "Consultant moves a plan set to approved, then back to in_progress -> both allowed", async () => {
    const a = await move(CONS, sets[0]!.id, "approved");
    expect(a.ok, `Consultant -> approved: ${a.status} ${a.body?.message}`).toBe(true);
    const b = await move(CONS, sets[0]!.id, "in_progress");
    expect(b.ok, `Consultant -> in_progress: ${b.status} ${b.body?.message}`).toBe(true);
  });
  await S.run(4, "PM moves a plan set to issued -> allowed", async () => {
    const r = await move(PM, sets[1]!.id, "issued");
    expect(r.ok, `PM -> issued: ${r.status} ${r.body?.message}`).toBe(true);
  });
  await S.run(5, "Design progress is the average of plan-set points inside 10-90", async () => {
    const bad: string[] = [];
    for (const target of ["not_started", "in_progress", "for_review", "approved", "issued"]) {
      for (const s of sets) await move(ADMIN, s.id, target);
      const v = await view(p);
      const now = await planSets(p);
      const avg = now.reduce((n, s) => n + (POINTS[s.status] ?? 0), 0) / now.length;
      const oracle = 10 + (80 * avg) / 100; // independent calculation of the 10-90 band
      if (Math.abs(v.progress - oracle) > 1) bad.push(`all sets ${target}: progress ${v.progress}, expected ${Math.round(oracle)}`);
    }
    // a mix of statuses: 0, 40, 70, 90, 100 -> average 60 -> 58
    const mix = ["not_started", "in_progress", "for_review", "approved", "issued"];
    for (const [i, s] of sets.entries()) await move(ADMIN, s.id, mix[i]!);
    const v = await view(p);
    if (Math.abs(v.progress - 58) > 1) bad.push(`mixed statuses: progress ${v.progress}, expected 58`);
    expect(bad, bad.join("; ")).toEqual([]);
  });
  S.done();
});

test("LC-172 Turnover gates T1-T4 and the Design Turnover workflow", async () => {
  const S = steps("LC-172");
  const p = await createProject({ deliveryType: "Design", phase: "Closeout", creator: PM, name: `QA turnover ${uid()}` });
  await staff(p, ARCH, "architect"); await staff(p, CONS, "consultant");
  let wf = 0;
  await S.run(1, "Architect uploads the Turnover Document -> T1", async () => {
    expect(gateState(await view(p), "T1")?.passed).toBe(false);
    await addDoc(ARCH, p, "Turnover Document");
    expect(gateState(await view(p), "T1")?.passed).toBe(true);
  });
  await S.run(2, "PM uploads the Client Acceptance document -> T2", async () => {
    await addDoc(PM, p, "Client Acceptance");
    expect(gateState(await view(p), "T2")?.passed).toBe(true);
  });
  await S.run(3, "Architect starts Design Turnover and approves the Architect stage -> Consultant", async () => {
    const r = await startWorkflow(ARCH, "Design Turnover", p);
    expect(r.ok, `start: ${r.status} ${r.body?.message}`).toBe(true);
    wf = r.data.id;
    const w = await api<{ stages: { role: string; status: string }[] }>(PM, "GET", `/workflows/${wf}`);
    const cur = w.stages.find((s) => s.status === "current")?.role;
    if (cur === "architect") { const d = await decide(wf, "architect", ARCH); expect(d.ok, `${d.status} ${d.body?.message}`).toBe(true); }
    const after = (await api<{ stages: { role: string; status: string }[] }>(PM, "GET", `/workflows/${wf}`)).stages.find((s) => s.status === "current")?.role;
    expect(after, `current stage is ${after}`).toBe("consultant");
  });
  await S.run(4, "Consultant approves -> PM", async () => {
    const d = await decide(wf, "consultant", CONS); expect(d.ok, `${d.status} ${d.body?.message}`).toBe(true);
  });
  await S.run(5, "PM approves -> Admin", async () => {
    const d = await decide(wf, "project-manager", PM); expect(d.ok, `${d.status} ${d.body?.message}`).toBe(true);
  });
  await S.run(6, "PM acting on the Admin stage is blocked (out of order)", async () => {
    const d = await decide(wf, "admin", PM);
    expect(d.ok, "PM was allowed to act on the Admin stage").toBe(false);
  });
  await S.run(7, "Admin approves the final stage -> T3", async () => {
    const d = await decide(wf, "admin", ADMIN); expect(d.ok, `${d.status} ${d.body?.message}`).toBe(true);
    expect(gateState(await view(p), "T3")?.passed).toBe(true);
  });
  await S.run(8, "T4 passes and PM Advances -> Completed at 100%", async () => {
    expect(gateState(await view(p), "T4")?.passed).toBe(true);
    await advance(p);
    const v = await view(p);
    expect(v.phase).toBe("Completed"); expect(v.progress).toBe(100);
  });
  S.done();
});
