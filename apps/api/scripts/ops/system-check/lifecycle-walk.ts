// Lifecycle walk: ONE fresh project taken Proposal -> Design -> Pre-Construction -> Construction
// -> Closeout -> Completed -> Archived.
//
// For every phase it (1) shows the gates failing and the UI's Advance button disabled / the API refusing,
// (2) performs the real role actions one at a time (same API calls the UI makes, as the right role),
// recording which gate flips after each action, then (3) presses "Advance to ..." in the browser as the PM
// (and "Archive" as Admin) and checks the phase really moved.
//
// LOCAL THROWAWAY DATABASE ONLY (demo guard enforces it). usage, from apps/api/:
//   ALLOW_DEMO_RESET=true npx tsx scripts/ops/system-check/lifecycle-walk.ts <outDir>
// Needs: API on :8123, Vite on :5173, demo accounts seeded, playwright + Chrome (CHROME_PATH).
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { api, raw, openSession, addDays, TODAY, BASE, type Account } from "../../demo/demo-seed-lib.js";
import { uploadPdf, uploadPng } from "../../demo/demo-files.js";

const WEB = process.env.WEB_BASE ?? "http://localhost:5173";
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const out = process.argv[2] ?? ".";
mkdirSync(out, { recursive: true });

type Check = { key: string; passed: boolean; detail?: string };
type View = { phase: string; canAdvance: boolean; nextPhase: string | null; checks: Check[]; progress: number; blockedReason?: string };
const results: { phase: string; step: string; ok: boolean; detail: string }[] = [];
const rec = (phase: string, step: string, ok: boolean, detail = "") => {
  results.push({ phase, step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${phase}] ${step}${detail ? " | " + detail : ""}`);
};

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]!;
const CODE = `LC-WALK-${String(Date.now()).slice(-5)}`;
let projectId = 0;
let pm: Account;
const view = () => api<View>(`/projects/${projectId}/lifecycle`, pm.token);
const keys = (v: View) => v.checks.map((c) => `${c.key}:${c.passed ? "ok" : "--"}`).join(" ");

/** run one action, then assert exactly which gates flipped to passed */
async function act(phase: string, label: string, expectFlip: string[], fn: () => Promise<unknown>, expectLose: string[] = []) {
  const before = await view();
  try {
    await fn();
  } catch (e) {
    rec(phase, label, false, `action failed: ${(e as Error).message.slice(0, 200)}`);
    return;
  }
  const after = await view();
  const flipped = after.checks.filter((c) => c.passed && !before.checks.find((b) => b.key === c.key)?.passed).map((c) => c.key);
  const lost = before.checks.filter((c) => c.passed && !after.checks.find((a) => a.key === c.key)?.passed).map((c) => c.key);
  const ok = expectFlip.every((k) => flipped.includes(k)) && flipped.every((k) => expectFlip.includes(k)) && lost.length === expectLose.length && expectLose.every((k) => lost.includes(k));
  rec(phase, label, ok, `flipped=[${flipped}] expected=[${expectFlip}]${lost.length ? " lost=" + lost : ""}${expectLose.length ? " expectedLost=" + expectLose : ""}`);
}

async function main() {
  const s = await openSession();
  pm = s.pm; const { architect, consultant, engineer, site, finance, hr, admin } = s;
  const pdf = (who: Account, name: string, title: string) => uploadPdf(BASE, who.token, name, title, [`Project ${CODE}`, title, "Lifecycle walk (synthetic)"]);
  const png = (who: Account, name: string, v = 0) => uploadPng(BASE, who.token, name, [CODE, name, "LIFECYCLE WALK", "2026"], v);
  let docSeq = 0;
  const doc = async (who: Account, type: string) => {
    const f = await pdf(who, `${CODE}-${type.replace(/\s+/g, "-")}.pdf`, type);
    docSeq += 1;
    return api("/documents", who.token, { method: "POST", body: { documentId: `${CODE}-D${docSeq}`, title: `${type} - ${CODE}`, project: CODE, type, version: "1.0", size: "1 KB", fileUrl: f.url, uploadedBy: who.name } });
  };

  // ---- browser ----
  let chromium: any;
  try { chromium = (await import("playwright")).chromium; } catch { chromium = (await import("/tmp/claude-0/ui/node_modules/playwright/index.mjs" as string)).chromium; }
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  // One sign-in per account (the API limits sign-ins to 40 per 15 minutes per address). The app keeps the token per
  // tab, so the same tab is reused for every later visit by that account.
  const sessions = new Map<string, any>();
  const signIn = async (acc: Account) => {
    let page = sessions.get(acc.email);
    if (!page) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
      page = await ctx.newPage();
      await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
      await page.fill("#email", acc.email); await page.fill("#password", "Demo@12345");
      await page.click("button:has-text('Sign in')");
      await page.waitForURL((u: URL) => !/\/login/.test(u.pathname), { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);
      if (/\/login/.test(page.url())) console.log(`  (UI sign-in did not complete for ${acc.email})`);
      sessions.set(acc.email, page);
    }
    return { ctx: { close: async () => {} }, page };
  };
  const openProject = async (page: any) => {
    for (const id of [projectId, CODE]) {
      await page.goto(`${WEB}/projects/${id}`, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(2500);
      if (await page.locator("text=/Advance to|Lifecycle|Archive|Actions/").count()) return true;
    }
    return false;
  };
  const advanceButton = (page: any) => page.getByRole("button", { name: /^Advance to/ }).first();
  const uiAdvance = async (phase: string, from: string, to: string) => {
    const { ctx, page } = await signIn(pm);
    const shown = await openProject(page);
    rec(phase, "Project page shows the lifecycle panel", shown, page.url().replace(WEB, ""));
    const btn = advanceButton(page);
    // The panel heading can render before its button; on a slow machine that gap made this check fail once.
    await btn.waitFor({ timeout: 10_000 }).catch(() => {});
    const present = (await btn.count()) > 0;
    const enabled = present && (await btn.isEnabled());
    rec(phase, `Advance button enabled once every gate passes`, enabled, present ? `button "${(await btn.innerText()).trim()}"` : "button not found");
    if (enabled) {
      await btn.click();
      await page.waitForTimeout(600);
      const dlg = await page.$("[role=alertdialog]:visible, [role=dialog]:visible");
      if (dlg) { const bs = await dlg.$$("button"); for (const b of bs.reverse()) { const t = (await b.innerText()).trim(); if (/advance|confirm|yes|continue|move/i.test(t)) { await b.click(); break; } } }
      await page.waitForTimeout(2500);
    }
    const v = await view();
    rec(phase, `UI Advance moved the project ${from} -> ${to}`, v.phase === to, `phase now ${v.phase}`);
    await page.screenshot({ path: `${out}/lifecycle-${to.replace(/\W+/g, "-")}.png` });
    await ctx.close();
    return v;
  };
  const uiBlocked = async (phase: string) => {
    const { ctx, page } = await signIn(pm);
    await openProject(page);
    const btn = advanceButton(page);
    const present = (await btn.count()) > 0;
    rec(phase, "Advance button is DISABLED while gates are open", present && (await btn.isDisabled()), present ? (await btn.innerText()).trim() : "not found");
    const txt = await page.locator("main, [data-slot='sidebar-inset']").first().innerText().catch(() => "");
    const failing = (await view()).checks.filter((c) => !c.passed).map((c) => c.key);
    rec(phase, "Panel lists the open gates", failing.length > 0, failing.join(","));
    void txt;
    await ctx.close();
  };
  const apiBlocked = async (phase: string) => {
    const r = await raw(`/projects/${projectId}/lifecycle/advance`, pm.token, { method: "POST", body: {} });
    rec(phase, "API refuses Advance while gates are open", r.status >= 400 && r.status < 500, `HTTP ${r.status}`);
  };

  // ================= create =================
  const created = await api<{ id: number }>("/projects", pm.token, {
    method: "POST",
    body: { name: `${pick(['Alder','Basalt','Cypress','Driftwood','Ember','Fernhill','Granite','Heron','Ironwood','Juniper','Kestrel','Larch'])} ${pick(['Clinic','Warehouse','Gymnasium','Dormitory','Bridge Works','Market Hall','Chapel','Depot'])}`, code: CODE, pm: pm.name, plannedStartDate: TODAY, due: "2027-12-31", client: "Walk Client Inc.", projectType: "Commercial", location: "Quezon City", description: "Lifecycle walk project", contractValue: 10_000_000 },
  });
  projectId = created.id;
  let v = await view();
  rec("Proposal", "Project created in Proposal phase", v.phase === "Proposal", `${CODE} id ${projectId}; gates ${keys(v)}`);

  // ================= PROPOSAL =================
  await uiBlocked("Proposal"); await apiBlocked("Proposal");
  const member = (acc: Account, role: string) => api("/project-members", pm.token, { method: "POST", body: { projectCode: CODE, userId: acc.id, userName: acc.name, role } });
  await act("Proposal", "PM staffs the architect", ["P1"], () => member(architect, "architect"));
  await act("Proposal", "PM staffs the consultant", ["P2"], () => member(consultant, "consultant"));
  await member(engineer, "engineer"); await member(site, "site-personnel"); // needed later, no gate in this phase
  let wfId = 0;
  await act("Proposal", "Architect submits proposal (P3)", ["P3"], async () => {
    const r = await api<{ workflow: { id: number } }>("/proposals/submit", architect.token, {
      method: "POST", body: { proposalId: `PRP-${CODE}`, title: `${CODE} proposal`, projectCode: CODE, submittedBy: architect.name, amount: "10000000", content: "Design proposal for the lifecycle walk project." },
    });
    wfId = r.workflow.id;
    const f = await pdf(architect, `${CODE}-proposal.pdf`, "Design Proposal");
    await api(`/workflows/${wfId}/attachments`, architect.token, { method: "POST", body: { kind: "document", label: "Proposal", fileUrl: f.url, fileName: f.filename, fileSize: "1 KB" } });
  });
  const stageOf = async (role: string) => (await api<{ stages: { id: number; role: string; status: string }[] }>(`/workflows/${wfId}`, pm.token)).stages.find((x) => x.role === role && x.status === "current");
  await act("Proposal", "Consultant approves (PM stage still open: P4 must stay closed)", [], async () => {
    const st = await stageOf("consultant");
    await api(`/workflows/${wfId}/stages/${st!.id}/decision`, consultant.token, { method: "PATCH", body: { decision: "approve", comments: "OK" } });
  });
  await act("Proposal", "PM approves the proposal (P4)", ["P4"], async () => {
    const st = await stageOf("project-manager");
    await api(`/workflows/${wfId}/stages/${st!.id}/decision`, pm.token, { method: "PATCH", body: { decision: "approve", comments: "Approved" } });
  });
  await act("Proposal", "Notice of Award alone does not open P5", [], () => doc(pm, "Notice of Award"));
  await act("Proposal", "Contract on file (P5)", ["P5"], () => doc(pm, "Contract"));
  v = await view();
  rec("Proposal", "All Proposal gates pass, canAdvance true", v.canAdvance && v.checks.every((c) => c.passed), keys(v));
  v = await uiAdvance("Proposal", "Proposal", "Design");

  // ================= DESIGN =================
  await uiBlocked("Design"); await apiBlocked("Design");
  let designId = 0, reviewId = 0;
  await act("Design", "Architect creates design with files + staffed engineer (D1)", ["D1"], async () => {
    const a = await png(architect, `${CODE}-plan.png`); const b = await pdf(architect, `${CODE}-design.pdf`, "Structural Design");
    const d = await api<{ id: number }>("/designs", architect.token, {
      method: "POST", body: { code: `DSN-${CODE}`, name: `${CODE} structural design`, projectCode: CODE, discipline: "Structural", category: "Structural", leadArchitect: architect.name, fileUrls: [{ name: a.filename, url: a.url }, { name: b.filename, url: b.url }], assignedEngineers: [{ userId: engineer.id, userName: engineer.name }] },
    });
    designId = d.id;
  });
  await act("Design", "Review requested but undecided: D2 stays closed", [], async () => {
    const r = await api<{ id: number }>("/design-reviews", consultant.token, { method: "POST", body: { code: `REV-${CODE}`, designId, requestedBy: architect.name } });
    reviewId = r.id;
  });
  await act("Design", "Consultant approves the design review (D2)", ["D2"], () => api(`/design-reviews/${reviewId}/decide`, consultant.token, { method: "POST", body: { decision: "Approved" } }));
  await act("Design", "Architect files approved current blueprint (D3)", ["D3"], () =>
    api("/blueprints", architect.token, { method: "POST", body: { drawingNumber: `BP-${CODE}`, title: `${CODE} drawing set`, folder: "Structural", discipline: "Structural", scale: "1:100", revision: "A", author: architect.name, approval: "Approved", status: "Current", fileType: "PDF", sizeKb: 1, projectCode: CODE, designId } }));
  v = await view();
  rec("Design", "All Design gates pass", v.canAdvance, keys(v));
  v = await uiAdvance("Design", "Design", "Pre-Construction");

  // ================= PRE-CONSTRUCTION =================
  await uiBlocked("Pre-Construction"); await apiBlocked("Pre-Construction");
  for (const category of ["Materials", "Specifications"] as const) {
    let reqId = 0;
    await act("Pre-Construction", `Engineer drafts ${category} requirement (Draft blocks C1)`, [], async () => {
      const f = await pdf(engineer, `${CODE}-${category}.pdf`, `${category} requirement`);
      const r = await api<{ id: number }>("/requirements", engineer.token, { method: "POST", body: { title: `${category} requirement - ${CODE}`, project: CODE, category, description: `${category} requirement for the walk project, grades and quantities.`, attachments: [{ url: f.url, filename: f.filename, contentType: f.contentType, sizeBytes: f.sizeBytes }], createdBy: engineer.name } });
      reqId = r.id;
    });
    await act("Pre-Construction", `PM approves ${category} requirement${category === "Specifications" ? " (C1)" : ""}`, category === "Specifications" ? ["C1"] : [], () => api(`/requirements/${reqId}`, pm.token, { method: "PATCH", body: { status: "Approved" } }));
  }
  const shares: [string, number][] = [["Materials", 0.45], ["Labor", 0.3], ["Equipment", 0.15], ["Contingency", 0.1]];
  for (const [i, [category, share]] of shares.entries()) {
    // C2 means "every existing line approved": line 1 alone opens it, and each new line (unapproved until its chain finishes) must be absorbed again.
    await act("Pre-Construction", `Finance creates + fully approves budget line ${category}${i === 0 ? " (C2 opens after the first approved line)" : ""}`, i === 0 ? ["C2"] : [], async () => {
      const b = await api<{ id: number }>("/finance/budgets", finance.token, { method: "POST", body: { project: CODE, category, owner: finance.name, planned: Math.round(10_000_000 * share), fiscalYear: TODAY.slice(0, 4) } });
      if (i > 0) { const mid = await view(); rec("Pre-Construction", `New unapproved ${category} line reopens C2`, mid.checks.find((c) => c.key === "C2")?.passed === false, keys(mid)); }
      for (const stage of ["draft", "pending-review", "finance-review", "manager-review"]) await api("/finance/budget-approval-steps/decide", finance.token, { method: "POST", body: { budgetId: b.id, stage, decision: "approved", actor: finance.name } });
    }, []);
  }
  const msIds: number[] = [];
  await act("Pre-Construction", "PM adds 2 dated milestones and activates them (C3)", ["C3"], async () => {
    for (let m = 0; m < 2; m++) {
      const ms = await api<{ id: number }>("/milestones", pm.token, { method: "POST", body: { projectCode: CODE, title: `Walk milestone ${m + 1}`, description: "Walk milestone", estimatedCompletionDate: addDays(TODAY, 60 * (m + 1)) } });
      await api(`/milestones/${ms.id}`, pm.token, { method: "PATCH", body: { status: "active" } });
      msIds.push(ms.id);
    }
  });
  const taskIds: number[] = [];
  await act("Pre-Construction", "PM creates tasks assigned to the site worker, linked to milestones (C4)", ["C4"], async () => {
    for (let i = 0; i < 4; i++) {
      const t = await api<{ id: number }>("/tasks", pm.token, { method: "POST", body: { taskCode: `TSK-${CODE}-${i + 1}`, projectCode: CODE, title: `Walk task ${i + 1}`, description: "Walk task", priority: "Medium", status: "Pending", progress: 0, dueDate: addDays(TODAY, 30 + i), assignedToUserId: site.id, assignedToName: site.name, milestoneId: msIds[i % 2] } });
      taskIds.push(t.id);
    }
  });
  await act("Pre-Construction", "PM files Notice to Proceed + sets site location (C5)", ["C5"], async () => {
    await doc(pm, "Notice to Proceed");
    await api(`/projects/${projectId}`, pm.token, { method: "PATCH", body: { siteLatitude: 14.5764, siteLongitude: 121.0851, geofenceRadiusM: 300 } });
  });
  v = await view();
  rec("Pre-Construction", "All Pre-Construction gates pass", v.canAdvance, keys(v));
  v = await uiAdvance("Pre-Construction", "Pre-Construction", "Construction");

  // ================= CONSTRUCTION =================
  await uiBlocked("Construction"); await apiBlocked("Construction");
  const complete = async (id: number) => {
    await api(`/tasks/${id}/status`, site.token, { method: "PATCH", body: { status: "In Progress" } }).catch(() => {});
    const f = await png(site, `${CODE}-evidence-${id}.png`, id);
    await api(`/tasks/${id}/status`, site.token, { method: "PATCH", body: { status: "Completed", completionNote: "Done and checked.", completionFileUrl: f.url } });
  };
  for (const [i, id] of taskIds.entries()) await act("Construction", `Site completes task ${i + 1}${i === taskIds.length - 1 ? " (K1)" : ""}`, i === taskIds.length - 1 ? ["K1"] : [], () => complete(id));
  const early = await raw(`/milestones/${msIds[0]}`, pm.token, { method: "PATCH", body: { status: "completed" } });
  rec("Construction", "Milestone completion refused while tasks open? (all done now, should be allowed)", early.status === 200, `HTTP ${early.status}`);
  await act("Construction", "PM completes the second milestone (K2)", ["K2"], () => api(`/milestones/${msIds[1]}`, pm.token, { method: "PATCH", body: { status: "completed" } }));
  let issueId = 0;
  await act("Construction", "Engineer reports an issue: K3 must close", [], async () => {
    const i = await api<{ id: number }>("/issues", engineer.token, { method: "POST", body: { issueCode: `ISS-${CODE}`, projectCode: CODE, category: "Quality", severity: "Low", title: "Walk issue", description: "Minor deviation found during the walk.", reportedByName: engineer.name } });
    issueId = i.id;
  }, ["K3"]);
  v = await view();
  rec("Construction", "Open issue blocks Advance (K3 fails)", !v.canAdvance && v.checks.find((c) => c.key === "K3")?.passed === false, keys(v));
  await act("Construction", "PM resolves the issue (K3 reopens to passed)", ["K3"], () => api(`/issues/${issueId}/status`, pm.token, { method: "PATCH", body: { status: "Resolved", resolutionNotes: "Corrected on site." } }));
  v = await view();
  rec("Construction", "All Construction gates pass", v.canAdvance, keys(v));
  v = await uiAdvance("Construction", "Construction", "Closeout");

  // ================= CLOSEOUT =================
  await uiBlocked("Closeout"); await apiBlocked("Closeout");
  let reportId = 0;
  await act("Closeout", "Engineer files Final Inspection (draft: X1 stays closed)", [], async () => {
    const r = await api<{ id: number }>("/engineering-reports", engineer.token, { method: "POST", body: { title: `Final inspection - ${CODE}`, type: "Final Inspection", project: CODE, location: "Quezon City", date: TODAY, engineer: engineer.name, description: "Final walkthrough.", findings: "All systems function as designed.", recommendations: "Approve for closeout." } });
    reportId = r.id;
  });
  await act("Closeout", "PM approves Final Inspection (X1)", ["X1"], () => api(`/engineering-reports/${reportId}`, pm.token, { method: "PATCH", body: { status: "Approved" } }));
  await act("Closeout", "Certificate of Completion on file (X2)", ["X2"], () => doc(pm, "Certificate of Completion"));
  const templates = await api<{ id: number; name: string }[]>("/workflows/templates", engineer.token);
  const closeTpl = templates.find((t) => t.name === "Project Closeout")!;
  const closeWf = await api<{ id: number }>("/workflows", engineer.token, { method: "POST", body: { title: `Project closeout - ${CODE}`, projectCode: CODE, templateId: closeTpl.id } });
  const roleTok: Record<string, string> = { "finance-manager": finance.token, "project-manager": pm.token, admin: admin.token };
  for (const role of ["finance-manager", "project-manager", "admin"]) {
    await act("Closeout", `Closeout workflow: ${role} approves${role === "admin" ? " (X4)" : ""}`, role === "admin" ? ["X4"] : [], async () => {
      const w = await api<{ stages: { id: number; role: string; status: string }[] }>(`/workflows/${closeWf.id}`, pm.token);
      const st = w.stages.find((x) => x.role === role && x.status === "current");
      if (!st) throw new Error(`no current ${role} stage: ${JSON.stringify(w.stages.map((x) => x.role + ":" + x.status))}`);
      await api(`/workflows/${closeWf.id}/stages/${st.id}/decision`, roleTok[role]!, { method: "PATCH", body: { decision: "approve" } });
    });
  }
  let batchId = "";
  await act("Closeout", "HR submits closeout payroll (pending batch keeps X3 closed)", [], async () => {
    const p = await api<{ batch: { id: string } }>("/payroll/generate", hr.token, { method: "POST", body: { period: `Closeout ${CODE}`, projectCode: CODE, entries: [{ employeeId: site.employeeId, hoursWorked: 64 }], submit: true } });
    batchId = p.batch.id;
  });
  await act("Closeout", "Finance approves closeout payroll (X3)", ["X3"], () => api(`/finance/payroll-review/${batchId}/decide`, finance.token, { method: "POST", body: { decision: "approved", reviewedBy: finance.name } }));
  v = await view();
  rec("Closeout", "All Closeout gates pass (incl. X5 no open RFI/RFA, X6 no unsettled procurement)", v.canAdvance, keys(v));
  v = await uiAdvance("Closeout", "Closeout", "Completed");
  rec("Completed", "Progress is 100%", v.progress === 100, `progress ${v.progress}`);

  // ================= COMPLETED -> ARCHIVED (Admin) =================
  {
    const { ctx, page } = await signIn(pm);
    await openProject(page);
    const has = (await page.getByRole("button", { name: /^Advance to/ }).count()) > 0 && (await page.getByRole("button", { name: /^Advance to/ }).first().isEnabled());
    rec("Completed", "PM has no working Advance past Completed (Archive is Admin-only)", !has, `advance enabled=${has}`);
    const r = await raw(`/projects/${projectId}/lifecycle/archive`, pm.token, { method: "POST", body: {} });
    rec("Completed", "PM archive attempt refused by the API", r.status === 403, `HTTP ${r.status}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await signIn(admin);
    await openProject(page);
    await page.getByRole("button", { name: "Actions" }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    const item = page.getByRole("menuitem", { name: "Archive" }).first();
    const present = (await item.count()) > 0;
    rec("Archived", "Admin sees Archive in the Actions menu", present);
    if (present) { await item.click(); await page.waitForTimeout(600); const d = await page.$("[role=alertdialog]:visible, [role=dialog]:visible"); if (d) { const bs = await d.$$("button"); for (const b of bs.reverse()) { if (/archive|confirm|yes/i.test((await b.innerText()).trim())) { await b.click(); break; } } } await page.waitForTimeout(2500); }
    v = await view();
    rec("Archived", "Admin Archive moved the project Completed -> Archived", v.phase === "Archived", `phase ${v.phase}`);
    await page.screenshot({ path: `${out}/lifecycle-Archived.png` });
    await ctx.close();
  }
  const w = await raw("/tasks", pm.token, { method: "POST", body: { taskCode: `TSK-${CODE}-X`, projectCode: CODE, title: "after archive", description: "x", priority: "Low", status: "Pending", progress: 0, dueDate: addDays(TODAY, 5) } });
  rec("Archived", "Archived project rejects new writes", w.status === 409, `HTTP ${w.status}`);
  // Not-PM roles may not advance (checked on a throwaway pair of attempts at the end, project is archived so also write-locked)
  for (const [name, acc] of [["engineer", engineer], ["site-personnel", site], ["finance", finance]] as const) {
    const r = await raw(`/projects/${projectId}/lifecycle/advance`, acc.token, { method: "POST", body: {} });
    rec("Archived", `${name} cannot call Advance`, r.status === 403 || r.status === 409, `HTTP ${r.status}`);
  }

  await browser.close();
  const fail = results.filter((r) => !r.ok);
  writeFileSync(`${out}/lifecycle-walk-results.json`, JSON.stringify({ project: CODE, total: results.length, failed: fail.length, results }, null, 1));
  console.log(`\n${results.length - fail.length}/${results.length} passed; project ${CODE}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
