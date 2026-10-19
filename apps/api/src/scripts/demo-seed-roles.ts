// apps/api/src/scripts/demo-seed-roles.ts
//
// Role sample data on top of the seven DEMO-S1..S7 projects: fills every page
// of every role's sidebar that the projects alone leave empty or thin. All
// writes go through the real HTTP API as the existing accounts (accounts are
// only logged into, never written), every file is a real small PDF/PNG pushed
// through POST /api/uploads, and every record is keyed on a natural key so a
// second run changes nothing.
//
// Run with: npm run demo:seed-roles   (or as the second half of npm run demo:seed)
import "dotenv/config";
import pg from "pg";
import { DEMO_PROJECTS } from "./demo-projects.js";
import { addDays, api, openSession, raw, TEAMS, type Account, type Session } from "./demo-seed-lib.js";
import { BASE } from "./demo-seed-lib.js";
import { uploadPdf, uploadPng } from "./demo-files.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/** mulberry32 — fixed seed so attendance and payroll hours are identical on every run. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const counts: Record<string, number> = {};
const failures: string[] = [];
const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

async function have(sql: string, params: unknown[]): Promise<boolean> {
  const r = await pool.query(sql, params);
  return r.rowCount! > 0;
}

async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    const msg = `${label}: ${(e as Error).message}`;
    failures.push(msg);
    console.error(`  ✘ ${msg}`);
    return undefined;
  }
}

const section = (name: string) => console.log(`\n▶ ${name}`);
const proj = (code: string) => DEMO_PROJECTS.find((p) => p.code === code)!;
const lines = (code: string, what: string) => [
  `Project: ${code}  ${proj(code).subtitle}`,
  `Client: ${proj(code).client}`,
  `Location: ${proj(code).location}`,
  `Document: ${what}`,
  "Synthetic file generated for the EasyConstruct demo data set.",
];
const pdf = (who: Account, name: string, title: string, body: string[]) => uploadPdf(BASE, who.token, name, title, body);
const png = (who: Account, name: string, body: string[], variant = 0) => uploadPng(BASE, who.token, name, body, variant);

let s: Session;
const team = (code: string) => {
  const t = TEAMS[code]!;
  return { pm: s[t.pm], architect: s[t.architect], consultant: s[t.consultant], engineer: t.engineer ? s[t.engineer] : undefined, site: t.site ? s[t.site] : undefined };
};

// ── 1. Proposals ───────────────────────────────────────────────────────────
async function proposals() {
  section("Proposals (Architect → Consultant → PM, Owner/IT Designer monitoring)");
  const specs: { code: string; n: string; title: string; outcome: "pending" | "revision" | "rejected" | "approved" }[] = [
    { code: "DEMO-S1", n: "02", title: "Mezzanine office extension", outcome: "pending" },
    { code: "DEMO-S1", n: "03", title: "Rooftop solar option", outcome: "revision" },
    { code: "DEMO-S1", n: "04", title: "Cold-room annex", outcome: "rejected" },
    { code: "DEMO-S2", n: "02", title: "Retaining wall redesign", outcome: "pending" },
    { code: "DEMO-S2", n: "03", title: "Landscape and drainage package", outcome: "pending" },
    { code: "DEMO-S3", n: "02", title: "Covered walkway upgrade", outcome: "pending" },
    { code: "DEMO-S3", n: "03", title: "Birthing-room fit-out", outcome: "approved" },
  ];
  for (const sp of specs) {
    const proposalId = `PRP-${sp.code}-${sp.n}`;
    if (await have("SELECT 1 FROM proposals WHERE proposal_id = $1", [proposalId])) continue;
    await attempt(`proposal ${proposalId}`, async () => {
      const t = team(sp.code);
      const amount = Math.round(proj(sp.code).contractValue * (0.03 + Number(sp.n) * 0.01));
      const sub = await api<{ proposal: { id: number }; workflow: { id: number; stages: { id: number; role: string }[] } }>("/proposals/submit", t.architect.token, {
        method: "POST",
        body: { proposalId, title: `${sp.title} (${sp.code})`, projectCode: sp.code, submittedBy: t.architect.name, amount: String(amount), content: `${sp.title} proposed for ${proj(sp.code).subtitle}. Scope, cost basis and programme impact are described in the attached document.` },
      });
      const f = await pdf(t.architect, `${proposalId}.pdf`, `${sp.title}`, [...lines(sp.code, sp.title), `Estimated amount: PHP ${amount.toLocaleString("en-PH")}`]);
      await api(`/workflows/${sub.workflow.id}/attachments`, t.architect.token, {
        method: "POST",
        body: { kind: "document", label: sp.title, fileUrl: f.url, fileName: f.filename, fileSize: `${Math.round(f.sizeBytes / 1024)} KB` },
      });
      if (sp.outcome === "revision" || sp.outcome === "rejected") {
        await api(`/proposals/${sub.proposal.id}/review`, t.consultant.token, {
          method: "PATCH",
          body: {
            status: sp.outcome === "revision" ? "Revision Requested" : "Rejected",
            reviewerName: t.consultant.name,
            reviewComment: sp.outcome === "revision" ? "Please add the structural load assumptions for the roof deck and resubmit." : "Outside the agreed scope and budget envelope for this contract.",
          },
        });
      } else if (sp.outcome === "approved") {
        const cs = sub.workflow.stages.find((x) => x.role === "consultant")!;
        await api(`/workflows/${sub.workflow.id}/stages/${cs.id}/decision`, t.consultant.token, { method: "PATCH", body: { decision: "approve", comments: "Meets the brief." } });
        const wf = await api<{ stages: { id: number; role: string }[] }>(`/workflows/${sub.workflow.id}`, t.pm.token);
        await api(`/workflows/${sub.workflow.id}/stages/${wf.stages.find((x) => x.role === "project-manager")!.id}/decision`, t.pm.token, { method: "PATCH", body: { decision: "approve" } });
      }
      bump("proposals");
    });
  }
}

// ── 2. Designs, design reviews, blueprints, architect documentation ───────
async function designs() {
  section("Designs / reviews / blueprints / documentation");
  const extra: { code: string; dcode: string; name: string; discipline: string; decision?: "Approved" | "Rejected" | "Changes Requested" }[] = [
    { code: "DEMO-S2", dcode: "DSN-S2-ARCH", name: "Townhome type A architectural layout", discipline: "Architectural", decision: "Approved" },
    { code: "DEMO-S2", dcode: "DSN-S2-SLOPE", name: "Slope stabilisation scheme", discipline: "Civil", decision: "Rejected" },
    { code: "DEMO-S3", dcode: "DSN-S3-ELEC", name: "Electrical and lighting layout", discipline: "Electrical", decision: "Approved" },
    { code: "DEMO-S4", dcode: "DSN-S4-MECH", name: "Mechanical (HVAC) layout", discipline: "Mechanical" },
  ];
  for (const [i, d] of extra.entries()) {
    if (await have("SELECT 1 FROM designs WHERE code = $1", [d.dcode])) continue;
    await attempt(`design ${d.dcode}`, async () => {
      const t = team(d.code);
      const img = await png(t.architect, `${d.dcode}.png`, [d.code, d.name.toUpperCase(), d.discipline.toUpperCase(), "SHEET 01"], i);
      const doc = await pdf(t.architect, `${d.dcode}.pdf`, d.name, lines(d.code, d.name));
      const design = await api<{ id: number }>("/designs", t.architect.token, {
        method: "POST",
        body: { code: d.dcode, name: d.name, projectCode: d.code, discipline: d.discipline, category: d.discipline, leadArchitect: t.architect.name, fileUrls: [{ name: img.filename, url: img.url }, { name: doc.filename, url: doc.url }], assignedEngineers: t.engineer ? [{ userId: t.engineer.id, userName: t.engineer.name }] : [] },
      });
      const review = await api<{ id: number }>("/design-reviews", t.consultant.token, {
        method: "POST",
        body: { code: `REV-${d.dcode}`.slice(0, 20), designId: design.id, discipline: d.discipline, priority: "Medium", requestedBy: t.architect.name, dueDate: addDays("2026-10-04", 7 + i * 3) },
      });
      if (d.decision) await api(`/design-reviews/${review.id}/decide`, t.consultant.token, { method: "POST", body: { decision: d.decision } });
      bump("designs");
    });
  }

  // Blueprints: Pending ones await the consultant; one Superseded; S2 never gets an Approved+Current one (D3 stays pending).
  const bps: { code: string; num: string; title: string; approval: string; status: string; decide?: "Approved" | "Rejected" | "Revision Required" }[] = [
    { code: "DEMO-S2", num: "BP-S2-RW", title: "Retaining wall details", approval: "Pending", status: "Draft", decide: "Rejected" },
    { code: "DEMO-S2", num: "BP-S2-SITE", title: "Site development plan", approval: "Pending", status: "Draft" },
    { code: "DEMO-S3", num: "BP-S3-ELEC", title: "Electrical layout set", approval: "Pending", status: "Draft", decide: "Approved" },
    { code: "DEMO-S4", num: "BP-S4-GF", title: "Ground floor plan Rev A", approval: "Approved", status: "Superseded" },
    { code: "DEMO-S4", num: "BP-S4-MECH", title: "Mechanical drawing set", approval: "Pending", status: "Draft" },
    { code: "DEMO-S4", num: "BP-S4-STR2", title: "Structural frame Rev B", approval: "Pending", status: "Draft", decide: "Revision Required" },
  ];
  for (const b of bps) {
    if (await have("SELECT 1 FROM blueprints WHERE drawing_number = $1", [b.num])) continue;
    await attempt(`blueprint ${b.num}`, async () => {
      const t = team(b.code);
      const created = await api<{ id: number }>("/blueprints", t.architect.token, {
        method: "POST",
        body: { drawingNumber: b.num, title: b.title, folder: "Structural", discipline: "Structural", scale: "1:100", revision: "A", author: t.architect.name, approval: b.approval, status: b.status, fileType: "PDF", sizeKb: 180, projectCode: b.code },
      });
      if (b.decide) await api(`/blueprints/${created.id}/decide`, t.consultant.token, { method: "POST", body: { approval: b.decide } });
      bump("blueprints");
    });
  }

  // Architect documentation register (the module stores metadata only — no file column).
  const docs: { code: string; title: string; category: string }[] = [
    { code: "DEMO-S3", title: "Design basis memorandum", category: "Design" },
    { code: "DEMO-S3", title: "Code compliance checklist", category: "Compliance" },
    { code: "DEMO-S4", title: "Facade material schedule", category: "Specification" },
    { code: "DEMO-S4", title: "Door and window schedule", category: "Schedule" },
  ];
  for (const d of docs) {
    if (await have("SELECT 1 FROM architect_documents WHERE title = $1", [d.title])) continue;
    await attempt(`architect-document ${d.title}`, async () => {
      const t = team(d.code);
      const design = await pool.query("SELECT id FROM designs WHERE project_code = $1 ORDER BY id LIMIT 1", [d.code]);
      await api("/architect-documents", t.architect.token, {
        method: "POST",
        body: { designId: design.rows[0]?.id, title: d.title, category: d.category, version: "1.0", owner: t.architect.name, fileType: "PDF", sizeKb: 240, status: "Current" },
      });
      bump("architect_documents");
    });
  }
}

// ── 3. Requirements (Engineer / Site Personnel / PM) ──────────────────────
async function requirements() {
  section("Requirements");
  const reqs: { code: string; title: string; category: string; status: "Draft" | "Under Review" | "Approved" | "Rejected"; by: "engineer" | "site" }[] = [
    { code: "DEMO-S3", title: "Site safety and traffic management plan", category: "Constraints", status: "Under Review", by: "engineer" },
    { code: "DEMO-S3", title: "Project objectives and success criteria", category: "Objectives", status: "Approved", by: "engineer" },
    { code: "DEMO-S3", title: "Alternative cladding option", category: "Other", status: "Rejected", by: "engineer" },
    { code: "DEMO-S3", title: "Temporary facilities layout", category: "Other", status: "Draft", by: "engineer" },
    { code: "DEMO-S4", title: "Basement waterproofing criteria", category: "Constraints", status: "Under Review", by: "engineer" },
    { code: "DEMO-S4", title: "Curing and testing procedure", category: "Objectives", status: "Approved", by: "engineer" },
    { code: "DEMO-S4", title: "Material staging area request", category: "Other", status: "Draft", by: "site" },
    { code: "DEMO-S4", title: "Noise window for night pours", category: "Constraints", status: "Under Review", by: "site" },
  ];
  for (const r of reqs) {
    if (await have("SELECT 1 FROM requirements WHERE project = $1 AND title = $2", [r.code, r.title])) continue;
    await attempt(`requirement ${r.title}`, async () => {
      const t = team(r.code);
      const author = r.by === "site" ? t.site! : t.engineer!;
      const f = await pdf(author, `${r.code}-req-${bump("req_files")}.pdf`, r.title, lines(r.code, r.title));
      const created = await api<{ id: number }>("/requirements", author.token, {
        method: "POST",
        body: { title: r.title, project: r.code, category: r.category, description: `${r.title} for ${proj(r.code).subtitle}: scope, acceptance criteria and responsible parties.`, status: r.status === "Under Review" ? "Under Review" : "Draft", attachments: [{ url: f.url, filename: f.filename, contentType: f.contentType, sizeBytes: f.sizeBytes }], createdBy: author.name },
      });
      if (r.status === "Approved" || r.status === "Rejected") {
        await api(`/requirements/${created.id}`, t.pm.token, { method: "PATCH", body: { status: r.status } });
      }
      bump("requirements");
    });
  }
}

// ── 4. Issues (Site Personnel with photos, PM triage) ─────────────────────
async function issues() {
  section("Issues");
  const items: { code: string; title: string; description: string; category: string; severity: string; triage?: "Under Review" }[] = [
    { code: "ISS-S4-05", title: "Standing water at basement access ramp", description: "Water pooling at the ramp entrance after rain; pump on standby.", category: "Safety", severity: "High", triage: "Under Review" },
    { code: "ISS-S4-06", title: "Delivery truck blocked the east gate", description: "Concrete truck queued across the east gate for about 40 minutes.", category: "Resource", severity: "Low" },
    { code: "ISS-S4-07", title: "Cracked formwork panel on level 2", description: "One plywood formwork panel split along the edge before the pour.", category: "Quality", severity: "Medium" },
  ];
  for (const [i, it] of items.entries()) {
    if (await have("SELECT 1 FROM issues WHERE issue_code = $1", [it.code])) continue;
    await attempt(`issue ${it.code}`, async () => {
      const t = team("DEMO-S4");
      const photo = await png(t.site!, `${it.code}.png`, ["DEMO-S4", it.title.slice(0, 30).toUpperCase(), "SITE PHOTO", `ISSUE ${it.code}`], i + 1);
      const created = await api<{ id: number }>("/issues", t.site!.token, {
        method: "POST",
        body: { issueCode: it.code, projectCode: "DEMO-S4", title: it.title, description: it.description, category: it.category, severity: it.severity, attachmentUrl: photo.url, reportedByName: t.site!.name, siteContext: "Level 2 / east gate" },
      });
      if (it.triage) await api(`/issues/${created.id}/status`, t.pm.token, { method: "PATCH", body: { status: it.triage } });
      bump("issues");
    });
  }
}

// ── 5. Engineering reports ─────────────────────────────────────────────────
async function reports() {
  section("Engineering reports");
  const items: { code: string; id: string; title: string; type: string; status: "Submitted" | "Under Review" | "Approved" | "Revision Required" | "Draft"; priority: string; date: string }[] = [
    { code: "DEMO-S4", id: "RPT-S4-01", title: "Weekly progress report - week 38", type: "Progress Report", status: "Submitted", priority: "Medium", date: "2026-09-25" },
    { code: "DEMO-S4", id: "RPT-S4-02", title: "Level 1 slab pour inspection", type: "Site Inspection", status: "Approved", priority: "Medium", date: "2026-08-28" },
    { code: "DEMO-S4", id: "RPT-S4-03", title: "Rebar cover quality inspection", type: "Quality Inspection", status: "Under Review", priority: "High", date: "2026-09-18" },
    { code: "DEMO-S4", id: "RPT-S4-04", title: "Scaffold safety observation", type: "Safety Observation", status: "Revision Required", priority: "High", date: "2026-09-30" },
    { code: "DEMO-S4", id: "RPT-S4-05", title: "Column C4 non-conformance", type: "Non-Conformance Report", status: "Draft", priority: "Critical", date: "2026-10-02" },
    { code: "DEMO-S5", id: "RPT-S5-01", title: "Cold-room commissioning report", type: "Technical Report", status: "Submitted", priority: "Medium", date: "2026-09-22" },
  ];
  for (const r of items) {
    if (await have("SELECT 1 FROM engineering_reports WHERE report_id = $1", [r.id])) continue;
    await attempt(`report ${r.id}`, async () => {
      const t = team(r.code);
      const created = await api<{ id: number }>("/engineering-reports", t.engineer!.token, {
        method: "POST",
        body: {
          reportId: r.id, title: r.title, type: r.type, project: r.code, location: proj(r.code).location, date: r.date, engineer: t.engineer!.name, priority: r.priority,
          description: `${r.title}. Prepared from site observations on ${r.date}.`,
          findings: "Works observed were generally in accordance with the approved drawings and specifications.",
          recommendations: "Proceed with the next activity subject to the noted actions.",
          requiredActions: r.status === "Revision Required" ? "Install missing base plates and re-submit photos." : undefined,
          status: r.status === "Approved" || r.status === "Revision Required" ? "Submitted" : r.status,
        },
      });
      if (r.status === "Approved" || r.status === "Revision Required") {
        await api(`/engineering-reports/${created.id}`, t.pm.token, { method: "PATCH", body: { status: r.status } });
      }
      bump("engineering_reports");
    });
  }
}

// ── 6. Documents of every type (Admin / Site field docs / advisory) ───────
async function documents() {
  section("Documents (field, advisory, turnover)");
  const mk = async (who: Account, code: string, id: string, type: string, title: string, rel?: { relatedType: "proposal" | "design"; relatedId: number }, image = false) => {
    if (await have("SELECT 1 FROM documents WHERE document_id = $1", [id])) return;
    await attempt(`document ${id}`, async () => {
      const f = image ? await png(who, `${id}.png`, [code, title.slice(0, 28).toUpperCase(), type.toUpperCase(), "2026"], bump("doc_files")) : await pdf(who, `${id}.pdf`, title, lines(code, title));
      await api("/documents", who.token, { method: "POST", body: { documentId: id, title, project: code, type, version: "1.0", size: `${Math.max(1, Math.round(f.sizeBytes / 1024))} KB`, fileUrl: f.url, uploadedBy: who.name, ...(rel ?? {}) } });
      bump("documents");
    });
  };
  const t4 = team("DEMO-S4");
  await mk(t4.site!, "DEMO-S4", "F-S4-001", "Site Photo", "Level 2 slab formwork - east bay", undefined, true);
  await mk(t4.site!, "DEMO-S4", "F-S4-002", "Site Photo", "Rebar mat before pour - grid B", undefined, true);
  await mk(t4.site!, "DEMO-S4", "F-S4-003", "Site Photo", "Concrete pour in progress", undefined, true);
  await mk(t4.site!, "DEMO-S4", "F-S4-004", "Field Report", "Daily site report - 30 Sep 2026");
  await mk(t4.site!, "DEMO-S4", "F-S4-005", "Field Report", "Daily site report - 01 Oct 2026");
  await mk(t4.engineer!, "DEMO-S4", "F-S4-006", "Progress Evidence", "Level 1 slab test cylinders - results");
  await mk(t4.engineer!, "DEMO-S4", "F-S4-007", "Supporting Document", "Concrete mix design submittal");
  await mk(team("DEMO-S5").pm, "DEMO-S5", "F-S5-001", "Turnover Document", "Operations and maintenance manual");
  await mk(team("DEMO-S5").architect, "DEMO-S5", "F-S5-002", "As-Built Drawing", "As-built plan set");
  await mk(team("DEMO-S6").pm, "DEMO-S6", "F-S6-001", "Turnover Document", "Warranty and handover pack");
  await mk(team("DEMO-S6").architect, "DEMO-S6", "F-S6-002", "As-Built Drawing", "As-built plan set");

  // Consultant advisory uploads, linked to a real proposal or design on the same project.
  const adv: { code: string; id: string; title: string; table: "proposals" | "designs"; kind: "proposal" | "design" }[] = [
    { code: "DEMO-S1", id: "A-S1-001", title: "Advisory: warehouse floor loading guidance", table: "proposals", kind: "proposal" },
    { code: "DEMO-S2", id: "A-S2-001", title: "Advisory: hillside drainage review notes", table: "designs", kind: "design" },
    { code: "DEMO-S2", id: "A-S2-002", title: "Advisory: retaining wall reference standard", table: "proposals", kind: "proposal" },
    { code: "DEMO-S3", id: "A-S3-001", title: "Advisory: rural health unit planning guide", table: "designs", kind: "design" },
    { code: "DEMO-S4", id: "A-S4-001", title: "Advisory: post-tensioning review memo", table: "designs", kind: "design" },
  ];
  for (const a of adv) {
    const row = await pool.query(`SELECT id FROM ${a.table} WHERE project_code = $1 ORDER BY id LIMIT 1`, [a.code]);
    await mk(team(a.code).consultant, a.code, a.id, "Supporting Document", a.title, row.rows[0] ? { relatedType: a.kind, relatedId: row.rows[0].id } : undefined);
  }
}

// ── 7. Expenses and budget adjustments (Finance) ──────────────────────────
async function finance() {
  section("Expenses / budget adjustments");
  const items: [string, string, string, number, "approved" | "pending" | "rejected"][] = [
    ["DEMO-S4", "Mapei Philippines", "Materials", 1_250_000, "pending"],
    ["DEMO-S4", "Cebu Scaffolding Rental", "Equipment", 640_000, "pending"],
    ["DEMO-S4", "Davao Rebar Traders", "Materials", 2_980_000, "rejected"],
    ["DEMO-S4", "SafeSite PPE Supply", "Contingency", 185_000, "approved"],
    ["DEMO-S4", "Metro Manpower Overtime", "Labor", 920_000, "pending"],
    ["DEMO-S4", "Quarry Aggregates Inc.", "Materials", 1_740_000, "rejected"],
    ["DEMO-S5", "Cold Chain Controls Corp.", "Equipment", 1_620_000, "approved"],
    ["DEMO-S5", "Laguna Electrical Works", "Labor", 880_000, "approved"],
    ["DEMO-S5", "Insulpanel Manufacturing", "Materials", 2_450_000, "approved"],
    ["DEMO-S5", "Calamba Paints Depot", "Materials", 310_000, "approved"],
    ["DEMO-S5", "Final cleaning contractor", "Contingency", 145_000, "pending"],
    ["DEMO-S5", "Testing and commissioning fees", "Equipment", 390_000, "pending"],
    ["DEMO-S3", "Geotechnical survey fees", "Contingency", 210_000, "approved"],
    ["DEMO-S3", "Temporary fencing supply", "Materials", 165_000, "pending"],
  ];
  for (const [i, [code, vendor, category, amount, status]] of items.entries()) {
    if (await have("SELECT 1 FROM expenses WHERE project = $1 AND vendor = $2 AND amount = $3", [code, vendor, amount])) continue;
    await attempt(`expense ${vendor}`, async () => {
      const receipt = await pdf(s.finance, `${code}-expense-x${i + 1}.pdf`, `Official Receipt - ${vendor}`, [`Vendor: ${vendor}`, `Project: ${code}`, `Category: ${category}`, `Amount: PHP ${amount.toLocaleString("en-PH")}`]);
      const ex = await api<{ id: string }>("/finance/expenses", s.finance.token, { method: "POST", body: { vendor, project: code, category, amount, receiptUrl: receipt.url } });
      if (status === "approved") await api(`/finance/expenses/${ex.id}/approve`, s.finance.token, { method: "PATCH", body: {} });
      if (status === "rejected") await api(`/finance/expenses/${ex.id}/reject`, s.finance.token, { method: "PATCH", body: {} });
      bump("expenses");
    });
  }

  const adj: { code: string; category: string; kind: "increase" | "decrease" | "transfer" | "emergency"; amount: number; reason: string; approve: boolean }[] = [
    { code: "DEMO-S4", category: "Equipment", kind: "increase", amount: 600_000, reason: "Extended crane rental for the level 3 slab", approve: true },
    { code: "DEMO-S4", category: "Contingency", kind: "decrease", amount: -400_000, reason: "Release unused contingency to materials", approve: true },
    { code: "DEMO-S4", category: "Materials", kind: "emergency", amount: 1_100_000, reason: "Emergency rebar re-order after failed spot check", approve: false },
    { code: "DEMO-S5", category: "Materials", kind: "increase", amount: 250_000, reason: "Additional insulation panels for plant room", approve: true },
  ];
  for (const a of adj) {
    if (await have("SELECT 1 FROM budget_adjustments WHERE reason = $1", [a.reason])) continue;
    await attempt(`adjustment ${a.reason}`, async () => {
      const b = await pool.query("SELECT id, planned FROM budgets WHERE project = $1 AND category = $2", [a.code, a.category]);
      const budget = b.rows[0];
      if (!budget) throw new Error("budget line not found");
      const original = Number(budget.planned);
      const created = await api<{ id: number }>("/finance/budget-adjustments", s.finance.token, {
        method: "POST",
        body: { budgetId: budget.id, kind: a.kind, originalAmount: original, adjustmentAmount: a.amount, newAmount: original + a.amount, reason: a.reason, requestedBy: s.finance.name, status: a.approve ? "pending-review" : "finance-review" },
      });
      if (a.approve) await api(`/finance/budget-adjustments/${created.id}`, s.finance.token, { method: "PATCH", body: { status: "approved", approvedBy: s.finance.name } });
      bump("budget_adjustments");
    });
  }
}

// ── 8. Workflows at different stages (Admin / Owner oversight) ────────────
async function workflows() {
  section("Workflows");
  const templates = await api<{ id: number; name: string }[]>("/workflows/templates", s.admin.token);
  // A template this seed names may not exist in a given database (templates are editable data).
  // That used to surface as "Cannot read properties of undefined (reading 'id')"; it is now skipped
  // with the template name, so the other workflows are still created and the cause is obvious.
  const tpl = (n: string) => templates.find((t) => t.name === n)?.id;
  const specs: { title: string; code: string; template: string; by: Account; advance?: ("human-resources" | "engineer" | "consultant")[]; stallHours?: number }[] = [
    { title: "Document compliance review - structural drawings", code: "DEMO-S2", template: "Document Compliance Review", by: team("DEMO-S2").consultant },
    { title: "Subcontractor onboarding - formwork contractor", code: "DEMO-S4", template: "Subcontractor onboarding", by: s.hr, advance: ["human-resources"] },
    // Started by the PM, so it sits at the HR stage: HR has an item waiting on it.
    { title: "Subcontractor onboarding - electrical contractor", code: "DEMO-S4", template: "Subcontractor onboarding", by: team("DEMO-S4").pm },
    { title: "Change order - additional mezzanine slab", code: "DEMO-S4", template: "Change Order Request", by: team("DEMO-S4").pm, stallHours: 130 },
    { title: "Public works compliance - health center permits", code: "DEMO-S3", template: "Public works compliance", by: team("DEMO-S3").architect },
    { title: "Structural requirement - column grid revision", code: "DEMO-S3", template: "Structural Requirement Request", by: team("DEMO-S3").engineer!, advance: ["engineer"], stallHours: 75 },
  ];
  for (const w of specs) {
    if (await have("SELECT 1 FROM workflows WHERE title = $1 AND project_code = $2", [w.title, w.code])) continue;
    const templateId = tpl(w.template);
    if (templateId === undefined) {
      console.log(`  skipped workflow "${w.title}": no workflow template named "${w.template}" in this database (create it in the Workflow Configuration page to include it)`);
      continue;
    }
    await attempt(`workflow ${w.title}`, async () => {
      const f = await pdf(w.by, `wf-${w.code}-${bump("wf_files")}.pdf`, w.title, lines(w.code, w.title));
      const wf = await api<{ id: number; stages: { id: number; role: string; status: string }[] }>("/workflows", w.by.token, {
        method: "POST",
        body: { title: w.title, projectCode: w.code, templateId, attachments: [{ kind: "document", label: w.title, fileUrl: f.url, fileName: f.filename, fileSize: `${Math.round(f.sizeBytes / 1024)} KB` }] },
      });
      let current = wf.stages.find((x) => x.status === "current");
      for (const role of w.advance ?? []) {
        const view = await api<{ stages: { id: number; role: string; status: string }[] }>(`/workflows/${wf.id}`, s.admin.token);
        const st = view.stages.find((x) => x.role === role && x.status === "current");
        if (!st) continue;
        const actor = role === "human-resources" ? s.hr : role === "engineer" ? team(w.code).engineer! : team(w.code).consultant;
        await api(`/workflows/${wf.id}/stages/${st.id}/decision`, actor.token, { method: "PATCH", body: { decision: "approve" } });
      }
      const view = await api<{ stages: { id: number; role: string; status: string }[] }>(`/workflows/${wf.id}`, s.admin.token);
      current = view.stages.find((x) => x.status === "current") ?? current;
      if (w.stallHours && current) await pool.query("UPDATE workflow_stages SET updated_at = now() - ($2 || ' hours')::interval WHERE id = $1", [current.id, String(w.stallHours)]);
      bump("workflows");
    });
  }
}

// ── 9. Attendance (HR / PM / Site) ─────────────────────────────────────────
async function attendance() {
  section("Attendance (5 weeks, S4 + S5 crews, plus Site Personnel clock-ins)");
  const rand = rng(77001);
  const siteNames = new Map(DEMO_PROJECTS.map((p) => [p.name, p]));
  const crew = (await pool.query(`SELECT employee_id, name, site FROM employees WHERE user_id IS NULL AND status = 'Active' AND site IN ($1,$2) ORDER BY employee_id`, [proj("DEMO-S4").name, proj("DEMO-S5").name])).rows as { employee_id: string; name: string; site: string }[];
  const weekdays: string[] = [];
  for (let d = "2026-08-31"; d <= "2026-10-02"; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) weekdays.push(d);
  }
  const photoFor = new Map<string, string>();
  for (const e of crew) {
    const p = siteNames.get(e.site)!;
    const f = await png(s.admin, `att-${e.employee_id}.png`, [p.code, e.name.slice(0, 26).toUpperCase(), "CLOCK-IN PHOTO", e.employee_id], Number(e.employee_id.slice(-2)));
    photoFor.set(e.employee_id, f.url);
  }
  let made = 0;
  for (const e of crew) {
    const p = siteNames.get(e.site)!;
    for (const d of weekdays) {
      const roll = rand();
      if (await have("SELECT 1 FROM attendance WHERE employee_id = $1 AND log_date = $2", [e.employee_id, d])) continue;
      const status = roll < 0.74 ? "Present" : roll < 0.84 ? "Late" : roll < 0.9 ? "Absent" : roll < 0.95 ? "Half Day" : "Present";
      const geo = rand();
      const coords = geo < 0.03 ? { latitude: p.lat + 0.006, longitude: p.lng + 0.005 } : geo < 0.05 ? {} : { latitude: p.lat + (rand() - 0.5) * 0.0014, longitude: p.lng + (rand() - 0.5) * 0.0014 };
      const clockIn = status === "Late" ? `08:${String(10 + Math.floor(rand() * 45)).padStart(2, "0")}` : status === "Absent" ? "08:00" : `07:${String(Math.floor(rand() * 25)).padStart(2, "0")}`;
      const clockOut = status === "Absent" ? undefined : status === "Half Day" ? "12:00" : "16:30";
      await attempt(`attendance ${e.employee_id} ${d}`, async () => {
        await api("/attendance", s.admin.token, {
          method: "POST",
          body: { employeeId: e.employee_id, site: p.name, projectCode: p.code, clockIn, clockOut, attendanceStatus: status, logDate: d, photoUrl: photoFor.get(e.employee_id), remarks: status === "Absent" ? "No show - not notified" : status === "Late" ? "Traffic on the access road" : undefined, ...coords },
        });
        made += 1;
      });
    }
  }
  bump("attendance_crew", made);

  // Site Personnel's own clock-ins (live path: staffed check + geofence + photo).
  const site = s.site;
  const sitePhoto = await png(site, `att-${site.employeeId}.png`, ["DEMO-S4", site.name.toUpperCase(), "CLOCK-IN PHOTO", site.employeeId!], 2);
  let mine = 0;
  for (const d of weekdays.filter((x) => x >= "2026-09-14")) {
    if (await have("SELECT 1 FROM attendance WHERE employee_id = $1 AND log_date = $2", [site.employeeId, d])) continue;
    const p = proj("DEMO-S4");
    const outside = d === "2026-09-22" || d === "2026-09-29";
    await attempt(`site attendance ${d}`, async () => {
      await api("/attendance", site.token, {
        method: "POST",
        body: { employeeId: site.employeeId, site: p.name, projectCode: p.code, clockIn: "07:05", clockOut: "16:10", logDate: d, photoUrl: sitePhoto.url, latitude: p.lat + (outside ? 0.0062 : (rand() - 0.5) * 0.001), longitude: p.lng + (outside ? 0.0051 : (rand() - 0.5) * 0.001), remarks: outside ? "Delivery pick-up outside the gate" : undefined },
      });
      mine += 1;
    });
  }
  bump("attendance_site", mine);
}

// ── 10. Payroll batches in different states (HR / Finance) ─────────────────
async function payroll() {
  section("Payroll (real generate path → statutory deductions from ph-statutory.ts)");
  const rand = rng(99021);
  const crew = (await pool.query(`SELECT employee_id FROM employees WHERE user_id IS NULL AND status = 'Active' AND site = $1 ORDER BY employee_id LIMIT 12`, [proj("DEMO-S4").name])).rows.map((r) => r.employee_id as string);
  const batches: { period: string; submit: boolean; decide?: "approved" | "rejected" }[] = [
    { period: "S4 31 Aug - 13 Sep", submit: true, decide: "approved" },
    { period: "S4 14 - 27 Sep", submit: true },
    { period: "S4 28 Sep - 11 Oct", submit: false },
    { period: "S4 17 - 30 Aug", submit: true, decide: "rejected" },
  ];
  for (const b of batches) {
    if (await have("SELECT 1 FROM payroll_batches WHERE project_code = 'DEMO-S4' AND period = $1", [b.period])) continue;
    await attempt(`payroll ${b.period}`, async () => {
      const gen = await api<{ batch: { id: string } }>("/payroll/generate", s.hr.token, {
        method: "POST",
        body: { period: b.period, projectCode: "DEMO-S4", entries: crew.map((id) => ({ employeeId: id, hoursWorked: 72 + Math.floor(rand() * 9), overtimeHours: rand() < 0.4 ? 4 + Math.floor(rand() * 8) : 0 })), submit: b.submit },
      });
      if (b.decide) {
        await api(`/finance/payroll-review/${gen.batch.id}/decide`, s.finance.token, {
          method: "POST",
          body: b.decide === "approved" ? { decision: "approved", reviewedBy: s.finance.name } : { decision: "rejected", reviewedBy: s.finance.name, reasonCode: "incorrect_overtime", comment: "Overtime hours do not match the verified attendance for this period; please regenerate." },
        });
      }
      bump("payroll_batches");
    });
  }
}

async function main() {
  s = await openSession();
  await proposals();
  await designs();
  await requirements();
  await issues();
  await reports();
  await documents();
  await finance();
  await workflows();
  await attendance();
  await payroll();
  console.log("\n=== Created this run ===");
  console.table(counts);
  if (failures.length) {
    console.log(`\n${failures.length} step(s) failed:`);
    for (const f of failures) console.log(`  - ${f}`);
  }
  void raw;
}

main()
  .catch((e) => {
    console.error("\n✘ demo-seed-roles failed:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    setTimeout(() => process.exit(process.exitCode ?? 0), 250);
  });
