// Cross-module and security cases: LC-200, 201, 203, 204, 207, 300, 301. Reference: qa/spec/lifecycle.md section 5.
import { createHash } from "node:crypto";
import { createProject, api, raw, view, staff, addDoc, upload, pdfBytes, steps, expect, test, PM, ADMIN, ARCH, CONS, ENG, SITE, HR, IT, OWNER, HR as HRR, uid, today } from "../../src/kit.js";
import { PAGE_API } from "../../src/page-map.js";
import { QA_PASSWORD, ROLES } from "../../src/roles.js";
import { assertQaEnvironment } from "../../src/guard.js";
import { loadMatrix } from "../../src/spec.js";
import { call, session } from "../../src/api.js";

const base = () => assertQaEnvironment().apiUrl;
const numbersFor = (o: unknown, re: RegExp): [string, number][] => {
  const out: [string, number][] = [];
  const walk = (v: any, k = "") => { if (typeof v === "number" && re.test(k)) out.push([k, v]); else if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) walk(vv, kk); };
  walk(o); return out;
};

test("LC-200 Dashboard totals match the real data, per role", async () => {
  const S = steps("LC-200");
  const all = (await api<any[]>(ADMIN, "GET", "/projects")).length;
  await S.run(1, "Owner Portfolio count equals the API total", async () => {
    expect((await api<any[]>(OWNER, "GET", "/projects")).length).toBe(all);
  });
  await S.run(2, "Admin dashboard project count equals the API total", async () => {
    const nums = numbersFor(await api(ADMIN, "GET", "/dashboard/summary"), /project/i);
    expect(nums.some(([, n]) => n === all), `Admin dashboard project figures ${JSON.stringify(nums)} do not include the API total ${all}`).toBe(true);
  });
  await S.run(3, "PM dashboard cards equal the API totals", async () => {
    const mine = (await api<any[]>(PM, "GET", "/projects")).length;
    const nums = numbersFor(await api(PM, "GET", "/dashboard/summary"), /project/i);
    expect(nums.some(([, n]) => n === mine), `PM dashboard project figures ${JSON.stringify(nums)} do not include ${mine}`).toBe(true);
  });
  await S.run(4, "Engineer dashboard cards equal the API totals", async () => {
    const d: any = await api(ENG, "GET", "/dashboard/summary");
    const mine = (await api<any[]>(ENG, "GET", "/projects")).length;
    expect(d.assignedProjectCount, `assignedProjectCount ${d.assignedProjectCount}, /projects returns ${mine}`).toBe(mine);
  });
  await S.run(5, "IT Designer role summary equals the User Accounts table", async () => {
    const users = await api<any[]>(IT, "GET", "/users");
    const summary = await api<any[]>(IT, "GET", "/roles/summary");
    const counted = summary.reduce((n, r) => n + (r.users?.length ?? 0), 0);
    expect(counted, `role summary lists ${counted} accounts, table has ${users.length}`).toBe(users.length);
  });
  S.done();
});

test("LC-201 Visibility follows assignment", async () => {
  const S = steps("LC-201");
  const p1 = await createProject({ creator: ADMIN, name: `QA vis A ${uid()}` });
  const p2 = await createProject({ creator: ADMIN, pmRole: "Project Manager (other)", name: `QA vis B ${uid()}` });
  await staff(p1, ENG, "engineer");
  const codes = async (role: string) => (await api<any[]>(role, "GET", "/projects")).map((x) => x.code);
  await S.run(1, "Admin sees every project", async () => { const c = await codes(ADMIN); expect(c).toContain(p1.code); expect(c).toContain(p2.code); });
  await S.run(2, "PM sees only own projects", async () => { const c = await codes(PM); expect(c).toContain(p1.code); expect(c, "PM sees another PM's project").not.toContain(p2.code); });
  await S.run(3, "Engineer sees only the project they are assigned to", async () => { const c = await codes(ENG); expect(c).toContain(p1.code); expect(c, "Engineer sees an unassigned project").not.toContain(p2.code); });
  await S.run(4, "Owner sees all projects", async () => { const c = await codes(OWNER); expect(c).toContain(p1.code); expect(c).toContain(p2.code); });
  await S.run(5, "IT Designer has view-only access to Projects", async () => {
    expect((await raw(IT, "GET", "/projects")).ok).toBe(true);
    expect((await raw(IT, "POST", "/projects", {})).status).toBe(403);
  });
  S.done();
});

test("LC-203 Every state change is logged; phase history is complete", async () => {
  const S = steps("LC-203");
  const logs = async (role: string) => ((await api<any>(role, "GET", "/audit-logs?limit=100")).data as any[]);
  await S.run(1, "Activity Logs: each action has actor, action and time", async () => {
    const bad = (await logs(IT)).filter((l) => !l.actor || !l.action || !l.createdAt);
    expect(bad.length, `${bad.length} of the latest 100 entries lack an actor, action or time`).toBe(0);
  });
  await S.run(2, "Owner Audit Trail shows the same entries", async () => {
    expect((await logs(OWNER)).slice(0, 20).map((l) => l.id)).toEqual((await logs(IT)).slice(0, 20).map((l) => l.id));
  });
  await S.run(3, "Phase history lists every Advance, Hold, Cancel and Archive with a gate snapshot", async () => {
    const a = await createProject({ phase: "Design", creator: PM, name: `QA hist ${uid()}` });
    await raw(PM, "POST", `/projects/${a.id}/lifecycle/hold`, { reason: "QA history hold" });
    await raw(PM, "POST", `/projects/${a.id}/lifecycle/resume`, {});
    await raw(ADMIN, "POST", `/projects/${a.id}/lifecycle/cancel`, { reason: "QA history cancel" });
    const b = await createProject({ phase: "Archived", creator: PM, name: `QA hist2 ${uid()}` });
    const h = [...(await view(a, ADMIN)).history, ...(await view(b, ADMIN)).history];
    const kinds = h.map((x) => `${x.fromStatus}>${x.toStatus}`);
    for (const want of ["Proposal>Design", "Design>On Hold", "On Hold>Design", "Design>Cancelled", "Completed>Archived"]) expect(kinds, `history is missing ${want}`).toContain(want);
    expect(h.filter((x) => x.toStatus !== "On Hold" && x.fromStatus !== "On Hold" && !x.gateSnapshot).length, "some Advance/Archive rows carry no gate snapshot").toBe(0);
  });
  await S.run(4, "A log entry cannot be edited or deleted", async () => {
    const id = (await logs(ADMIN))[0].id;
    for (const m of ["PATCH", "PUT", "DELETE"]) { const r = await raw(ADMIN, m, `/audit-logs/${id}`, {}); expect(r.ok, `${m} /audit-logs/${id} succeeded (${r.status})`).toBe(false); }
  });
  await S.run(5, "Downloading a document and editing a project are both audited", async () => {
    const p = await createProject({ creator: PM, name: `QA audit ${uid()}` });
    const d: any = await addDoc(PM, p, "Contract");
    await fetch(`${base()}/uploads/file?url=${encodeURIComponent(d.fileUrl)}`, { headers: { Authorization: `Bearer ${(await session(ADMIN)).token}` } });
    await api(PM, "PATCH", `/projects/${p.id}`, { description: "QA audit edit" });
    const l = await logs(ADMIN);
    expect(l.some((x) => x.entityType === "project" && x.action === "updated" && x.projectCode === p.code), "project edit not audited").toBe(true);
    expect(l.some((x) => /download/i.test(`${x.action} ${x.summary}`)), "document download not audited").toBe(true);
  });
  S.done();
});

test("LC-204 Document upload, download integrity and access control", async () => {
  const S = steps("LC-204");
  const p = await createProject({ creator: PM, name: `QA docs ${uid()}` });
  let doc: any, file: any;
  await S.run(1, "PM uploads a document with title, project and type -> saved and listed", async () => {
    file = await upload(PM, `${p.code}-DesignFile.pdf`);
    doc = await api(PM, "POST", "/documents", { documentId: `${p.code}-D1`, title: "DesignFile", project: p.code, type: "Contract", version: "1.0", size: "1 KB", fileUrl: file.url, uploadedBy: (await session(PM)).name });
    expect((await api<any[]>(PM, "GET", "/documents")).some((d) => d.documentId === doc.documentId || d.id === doc.id)).toBe(true);
  });
  await S.run(3, "Downloaded file hash equals the uploaded file hash", async () => {
    const r = await fetch(`${base()}/uploads/file?url=${encodeURIComponent(file.url)}`, { headers: { Authorization: `Bearer ${(await session(PM)).token}` } });
    expect(r.status, `download ${r.status}`).toBe(200);
    const got = createHash("sha256").update(Buffer.from(await r.arrayBuffer())).digest("hex");
    const want = createHash("sha256").update(pdfBytes(`${p.code}-DesignFile.pdf`)).digest("hex");
    expect(got, "downloaded bytes differ from the uploaded bytes").toBe(want);
  });
  await S.run(4, "Site Personnel: Documents is view only, no upload", async () => {
    const rd = await raw(SITE, "GET", "/documents");
    expect(rd.ok, `Site Personnel cannot read Documents (${rd.status})`).toBe(true);
    const up = await raw(SITE, "POST", "/documents/upload", {});
    expect(up.status, `Site Personnel upload attempt returned ${up.status} (400 means validation ran before the role check)`).toBe(403);
  });
  await S.run(5, "HR opening the document URL directly gets no access", async () => {
    const r = await fetch(`${base()}/uploads/file?url=${encodeURIComponent(file.url)}`, { headers: { Authorization: `Bearer ${(await session(HR)).token}` } });
    expect(r.status, `HR downloading a project document got ${r.status}`).toBe(403);
  });
  S.done();
});

test("LC-207 DEMO-STAGE-0 to 6 match the documented percentages", async () => {
  const S = steps("LC-207");
  const want: [string, string, number][] = [["DEMO-STAGE-0", "Proposal", 8], ["DEMO-STAGE-1", "Design", 25], ["DEMO-STAGE-2", "Pre-Construction", 29], ["DEMO-STAGE-3", "Construction", 59], ["DEMO-STAGE-4", "Closeout", 99], ["DEMO-STAGE-5", "Completed", 100], ["DEMO-STAGE-6", "Archived", 100]];
  const list = await api<any[]>(ADMIN, "GET", "/projects");
  await S.run(1, "Each DEMO-STAGE project shows the documented phase and percentage", async () => {
    const bad = want.filter(([c, ph, pct]) => { const x = list.find((y) => y.code === c); return !x || x.status !== ph || Math.round(Number(x.progress)) !== pct; })
      .map(([c, ph, pct]) => { const x = list.find((y) => y.code === c); return `${c}: ${x ? `${x.status} ${x.progress}%` : "missing"}, expected ${ph} ${pct}%`; });
    expect(bad, bad.join("; ")).toEqual([]);
  });
  await S.run(2, "Lifecycle panel of each shows checks and a sensible blocked reason", async () => {
    const bad: string[] = [];
    for (const [c, ph] of want) {
      const x = list.find((y) => y.code === c); if (!x) { bad.push(`${c} missing`); continue; }
      const v = await view(x, ADMIN);
      if (!v.checks?.length && ph !== "Completed" && ph !== "Archived") bad.push(`${c}: no checks`);
      if (!v.canAdvance && !v.blockedReason && ph !== "Archived") bad.push(`${c}: blocked with no reason`);
    }
    expect(bad, bad.join("; ")).toEqual([]);
  });
  S.done();
});

test("LC-300 Denied-access sweep", async () => {
  const S = steps("LC-300");
  const m = loadMatrix();
  await S.run(2, "Every write endpoint as every View-only role returns 403", async () => {
    const bad: string[] = [];
    for (const row of m) { const api_ = PAGE_API[row.page]; if (row.isAction || !api_?.write) continue;
      for (const r of ROLES) if (row.byRole[r.label] === "View only") { const x = await call(r.label, api_.write.method, api_.write.path, api_.write.body); if (x.status !== 403) bad.push(`${r.label} ${api_.write.method} ${api_.write.path} -> ${x.status}`); } }
    expect(bad.length, `${bad.length} View-only write calls not blocked: ${bad.slice(0, 6).join("; ")}`).toBe(0);
  });
  await S.run(3, "Every API without a token returns 401", async () => {
    const bad: string[] = [];
    for (const [page, a] of Object.entries(PAGE_API)) { if (!a.read) continue; const x = await call(null, "GET", a.read); if (x.status !== 401) bad.push(`${page} ${a.read} -> ${x.status}`); }
    expect(bad, bad.join("; ")).toEqual([]);
  });
  S.done();
});

test("LC-301 Sessions and failed sign-ins are tracked", async () => {
  const S = steps("LC-301");
  const login = async (email: string, password: string) => { const r = await fetch(`${base()}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }); return { status: r.status, body: (await r.json().catch(() => null)) as any }; };
  const n = uid();
  const emp = await raw(HRR, "POST", "/employees", { employeeId: `EMP-QA-${n}`, name: `QA Session ${n}`, role: "Consultant", department: "Advisory", site: "Main Site", status: "Active", hiredOn: today(), email: `qa.session.${n.toLowerCase()}@easyconstruct.demo`, payRate: 100, rateType: "Hourly" });
  const e = (await api<any[]>(IT, "GET", "/users/linkable-employees")).find((x) => x.email === `qa.session.${n.toLowerCase()}@easyconstruct.demo`);
  await api(IT, "POST", "/users", { employeeId: e.id, password: QA_PASSWORD, role: "consultant" });
  const email = `qa.session.${n.toLowerCase()}@easyconstruct.demo`;
  let token = "";
  await S.run(1, "A login on a second device appears in IT Active sessions", async () => {
    await login(email, QA_PASSWORD); const second = await login(email, QA_PASSWORD); token = second.body.data.token;
    const ov = JSON.stringify(await api(IT, "GET", "/audit-logs/security-overview"));
    expect(ov, "the new session is not in the security overview").toContain(email);
  });
  await S.run(2, "A wrong password appears as a failed sign-in with the reason", async () => {
    await login(email, "wrong-password-123");
    const ov: any = await api(IT, "GET", "/audit-logs/security-overview");
    const hit = (ov.failedLogins ?? []).find((f: any) => JSON.stringify(f).includes(email));
    expect(hit, "failed sign-in not listed").toBeTruthy();
    expect(JSON.stringify(hit)).toMatch(/reason|password|invalid|incorrect/i);
  });
  await S.run(3, "After logout the old token is rejected", async () => {
    await new Promise((r) => setTimeout(r, 1500)); // tokens are timestamped to the second: make sure the token pre-dates the logout
    const out = await fetch(`${base()}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    expect(out.ok).toBe(true);
    const reuse = await fetch(`${base()}/dashboard/summary`, { headers: { Authorization: `Bearer ${token}` } });
    expect(reuse.status, `old token still works (${reuse.status})`).toBe(401);
  });
  S.done();
});
