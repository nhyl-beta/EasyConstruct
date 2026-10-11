// server/src/scripts/demo-seed-stages.ts
//
// Clean-slate demo projects: DEMO-S1 .. DEMO-S7, one per lifecycle phase
// (Proposal, Design, Pre-Construction, Construction, Closeout, Completed,
// Archived), each built through the real HTTP API as the real demo accounts —
// the same validators, services, workflow engine and upload path a user's data
// goes through. A project sits at its phase because its records satisfy every
// earlier phase's exit gates and `advance()` really moved it; progress comes
// from refreshProjectProgress(), never a hardcoded number.
//
// Current-phase gate pattern (see docs/demo-and-ux-progress.md "Clean slate"):
//   S1 Proposal      P1-P3 pass, P4 pending (workflow at Consultant stage), P5 pending
//   S2 Design        D1 passes, D2 pending (review requested, undecided), D3 pending
//   S3 Pre-Constr.   C1-C3 pass, C4 + C5 pending (tasks not fully planned, no NTP)
//   S4 Construction  mixed done/pending tasks; K4 fails (Budget Change Request active)
//   S5 Closeout      X1, X2 pass; X3 pending (payroll), X4 pending (Closeout workflow)
//   S6 Completed     everything passes
//   S7 Archived      completed, then archived by Admin; writes are rejected
//
// Idempotent: a project that already exists at its target phase is left alone
// (ids stay stable); a half-built one is removed (children first) and rebuilt.
// `npm run demo:seed` runs this and then demo-seed-roles.ts.
//
// Prerequisites: API running (`npm run dev`) with FEATURE_AI=true, accounts
// seeded (`npm run db:seed`), reference prices cached (`npm run ai:seed-references`).
import "dotenv/config";
import pg from "pg";
import { DEMO_PROJECTS, type DemoProject } from "./demo-projects.js";
import {
  api,
  addDays,
  openSession,
  TEAMS,
  TODAY,
  type Account,
  type Session,
  type Team,
} from "./demo-seed-lib.js";
import { uploadPdf, uploadPng, type StoredUpload } from "./demo-files.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const step = (label: string) => console.log(`  ▶ ${label}`);

// ── Idempotent cleanup (only for a half-built project) ────────────────────
async function cleanup(code: string) {
  const q = (sql: string) => pool.query(sql, [code]);
  await q("DELETE FROM validation_results WHERE project_code = $1");
  await q("DELETE FROM proposals WHERE project_code = $1");
  await q("DELETE FROM workflows WHERE project_code = $1");
  await q("DELETE FROM milestones WHERE project_code = $1");
  await q("DELETE FROM tasks WHERE project_code = $1");
  await q("DELETE FROM issues WHERE project_code = $1");
  await q("DELETE FROM requirements WHERE project = $1");
  await q("DELETE FROM documents WHERE project = $1");
  await q("DELETE FROM engineering_reports WHERE project = $1");
  await q("DELETE FROM revisions WHERE project_code = $1");
  await q("DELETE FROM blueprints WHERE project_code = $1");
  for (const t of ["design_reviews", "design_revisions", "architect_documents"]) {
    await q(`DELETE FROM ${t} WHERE design_id IN (SELECT id FROM designs WHERE project_code = $1)`);
  }
  await q("DELETE FROM designs WHERE project_code = $1");
  for (const t of ["budget_adjustments", "budget_allocations", "budget_approval_steps", "budget_comments", "budget_documents", "budget_history"]) {
    await q(`DELETE FROM ${t} WHERE budget_id IN (SELECT id FROM budgets WHERE project = $1)`);
  }
  await q("DELETE FROM budgets WHERE project = $1");
  await q("DELETE FROM expenses WHERE project = $1");
  await q("DELETE FROM payroll WHERE batch_id IN (SELECT id FROM payroll_batches WHERE project_code = $1)");
  await q("DELETE FROM payroll_batch_decisions WHERE batch_id IN (SELECT id FROM payroll_batches WHERE project_code = $1)");
  await q("DELETE FROM payroll_batches WHERE project_code = $1");
  await q("DELETE FROM attendance WHERE project_code = $1");
  await q("DELETE FROM project_members WHERE project_code = $1");
  await q("DELETE FROM project_phase_history WHERE project_code = $1");
  await q("DELETE FROM notifications WHERE project_code = $1");
  await q("DELETE FROM projects WHERE code = $1");
}

// Ensure the matcher has something real to compare against.
async function ensureReferenceRows() {
  const r = await pool.query("SELECT count(*)::int n FROM reference_snapshots");
  if (r.rows[0].n === 0) {
    throw new Error("reference_snapshots is empty — run `npm run ai:seed-references` first.");
  }
}

interface Ctx {
  p: DemoProject;
  code: string;
  projectId: number;
  s: Session;
  team: { pm: Account; architect: Account; consultant: Account; engineer?: Account; site?: Account };
  finance: Account;
  hr: Account;
  admin: Account;
}

let docSeq = 0;

// ── File helpers ───────────────────────────────────────────────────────────
const pdf = (who: Account, name: string, title: string, lines: string[]) => uploadPdf(baseUrl, who.token, name, title, lines);
const png = (who: Account, name: string, lines: string[], variant = 0) => uploadPng(baseUrl, who.token, name, lines, variant);
import { BASE as baseUrl } from "./demo-seed-lib.js";

const fileLines = (c: Ctx, what: string) => [
  `Project: ${c.code}  ${c.p.subtitle}`,
  `Client: ${c.p.client}`,
  `Location: ${c.p.location}`,
  `Document: ${what}`,
  `Prepared for the EasyConstruct demo data set (synthetic).`,
];

async function docRecord(c: Ctx, type: string, title: string, who: Account) {
  const f = await pdf(who, `${c.code}-${type.replace(/\s+/g, "-")}.pdf`, title, fileLines(c, title));
  docSeq += 1;
  return api("/documents", who.token, {
    method: "POST",
    body: {
      documentId: `${c.code.replace("DEMO-", "D")}-${String(docSeq).padStart(3, "0")}`,
      title: `${title} - ${c.p.subtitle}`,
      project: c.code,
      type,
      version: "1.0",
      size: `${Math.max(1, Math.round(f.sizeBytes / 1024))} KB`,
      fileUrl: f.url,
      uploadedBy: who.name,
    },
  });
}

// ── Phase builders ─────────────────────────────────────────────────────────

async function staff(c: Ctx) {
  const members: [Account | undefined, string][] = [
    [c.team.architect, "architect"],
    [c.team.consultant, "consultant"],
    [c.team.engineer, "engineer"],
    [c.team.site, "site-personnel"],
  ];
  for (const [acc, role] of members) {
    if (!acc) continue;
    await api("/project-members", c.team.pm.token, {
      method: "POST",
      body: { projectCode: c.code, userId: acc.id, userName: acc.name, role },
    });
  }
}

/** P1-P5. `complete` false leaves P4 (workflow at the Consultant stage) and P5 pending. */
async function buildProposal(c: Ctx, complete: boolean) {
  const { architect, consultant, pm } = c.team;
  const submitted = await api<{
    proposal: { id: number };
    workflow: { id: number; stages: { id: number; role: string; status: string }[] };
  }>("/proposals/submit", architect.token, {
    method: "POST",
    body: {
      proposalId: `PRP-${c.code}`,
      title: `${c.p.subtitle} - design proposal`,
      projectCode: c.code,
      submittedBy: architect.name,
      amount: String(c.p.contractValue),
      content: `${c.p.description} Client: ${c.p.client}. Location: ${c.p.location}.`,
    },
  });
  const wfId = submitted.workflow.id;
  const prop = await pdf(architect, `${c.code}-proposal.pdf`, `Design Proposal - ${c.p.subtitle}`, [
    ...fileLines(c, "Design proposal"),
    `Proposed contract value: PHP ${c.p.contractValue.toLocaleString("en-PH")}`,
    `Planned start: ${c.p.plannedStartDate}   Target completion: ${c.p.due}`,
  ]);
  await api(`/workflows/${wfId}/attachments`, architect.token, {
    method: "POST",
    body: { kind: "document", label: "Design proposal document", fileUrl: prop.url, fileName: prop.filename, fileSize: `${Math.round(prop.sizeBytes / 1024)} KB` },
  });
  if (!complete) return { proposalId: submitted.proposal.id, workflowId: wfId };

  const consultantStage = submitted.workflow.stages.find((s) => s.role === "consultant")!;
  await api(`/workflows/${wfId}/stages/${consultantStage.id}/decision`, consultant.token, {
    method: "PATCH",
    body: { decision: "approve", comments: "Scope, assumptions and cost basis are consistent with the brief." },
  });
  const after = await api<{ stages: { id: number; role: string }[] }>(`/workflows/${wfId}`, pm.token);
  const pmStage = after.stages.find((s) => s.role === "project-manager")!;
  await api(`/workflows/${wfId}/stages/${pmStage.id}/decision`, pm.token, {
    method: "PATCH",
    body: { decision: "approve", comments: "Approved for award." },
  });
  await docRecord(c, "Notice of Award", "Notice of Award", pm);
  await docRecord(c, "Contract", "Construction Contract", pm);
  return { proposalId: submitted.proposal.id, workflowId: wfId };
}

/** D1-D3. `decided` false leaves the design review undecided and no blueprint. */
async function buildDesign(c: Ctx, decided: boolean) {
  const { architect, consultant, engineer } = c.team;
  const planImg = await png(architect, `${c.code}-structural-plan.png`, [c.code, "STRUCTURAL PLAN", c.p.subtitle, "SHEET S-101"], 0);
  const planPdf = await pdf(architect, `${c.code}-structural-design.pdf`, `Structural Design - ${c.p.subtitle}`, fileLines(c, "Structural design package"));
  const design = await api<{ id: number }>("/designs", architect.token, {
    method: "POST",
    body: {
      code: `DSN-${c.code}`,
      name: `${c.p.subtitle} structural design`,
      projectCode: c.code,
      discipline: "Structural",
      category: "Structural",
      leadArchitect: architect.name,
      fileUrls: [
        { name: planImg.filename, url: planImg.url },
        { name: planPdf.filename, url: planPdf.url },
      ],
      assignedEngineers: engineer ? [{ userId: engineer.id, userName: engineer.name }] : [],
    },
  });
  const review = await api<{ id: number }>("/design-reviews", consultant.token, {
    method: "POST",
    body: { code: `REV-${c.code}`, designId: design.id, requestedBy: architect.name },
  });
  if (!decided) return { designId: design.id, reviewId: review.id };
  await api(`/design-reviews/${review.id}/decide`, consultant.token, { method: "POST", body: { decision: "Approved" } });
  await api("/blueprints", architect.token, {
    method: "POST",
    body: {
      drawingNumber: `BP-${c.code}`,
      title: `${c.p.subtitle} - approved drawing set`,
      folder: "Structural",
      discipline: "Structural",
      scale: "1:100",
      revision: "A",
      author: architect.name,
      approval: "Approved",
      status: "Current",
      fileType: "PDF",
      sizeKb: Math.max(1, Math.round(planPdf.sizeBytes / 1024)),
      projectCode: c.code,
      designId: design.id,
    },
  });
  return { designId: design.id, reviewId: review.id };
}

const TASK_PLAN: { milestone: string; tasks: string[] }[] = [
  { milestone: "Site preparation and substructure", tasks: ["Site clearing and layout staking", "Excavation and footing forms", "Rebar fabrication for footings", "Footing concrete pour"] },
  { milestone: "Superstructure", tasks: ["Column rebar installation", "Formwork for columns and slabs", "Slab pour - level 1", "Slab pour - level 2"] },
  { milestone: "Envelope and MEP rough-in", tasks: ["CHB wall laying", "Electrical conduit rough-in", "Plumbing rough-in", "Roof framing and deck"] },
  { milestone: "Finishes and turnover", tasks: ["Plastering and skim coat", "Tiling and flooring", "Interior painting", "Punch list and cleaning"] },
];

/** C1-C5. `complete` false leaves C4 (unplanned active milestones) and C5 (no NTP) pending. */
async function buildPreConstruction(c: Ctx, opts: { complete: boolean; taskCount: number }) {
  const { engineer, pm, architect } = c.team;
  const eng = engineer!;
  for (const category of ["Materials", "Specifications"] as const) {
    const f = await pdf(eng, `${c.code}-${category.toLowerCase()}-requirement.pdf`, `${category} requirement - ${c.p.subtitle}`, fileLines(c, `${category} requirement`));
    const req = await api<{ id: number }>("/requirements", eng.token, {
      method: "POST",
      body: {
        title: `${category} requirement - ${c.p.subtitle}`,
        project: c.code,
        category,
        description: `${category} requirement for ${c.p.subtitle}: grades, quantities and acceptance criteria for the works.`,
        attachments: [{ url: f.url, filename: f.filename, contentType: f.contentType, sizeBytes: f.sizeBytes }],
        createdBy: eng.name,
      },
    });
    await api(`/requirements/${req.id}`, pm.token, { method: "PATCH", body: { status: "Approved" } });
  }

  // Budget: four lines that add up to the contract value, each through the full approval chain.
  const shares: [string, number][] = [["Materials", 0.45], ["Labor", 0.3], ["Equipment", 0.15], ["Contingency", 0.1]];
  const budgetIds: Record<string, number> = {};
  for (const [category, share] of shares) {
    const b = await api<{ id: number }>("/finance/budgets", c.finance.token, {
      method: "POST",
      body: { project: c.code, category, owner: c.finance.name, planned: Math.round(c.p.contractValue * share), fiscalYear: c.p.plannedStartDate.slice(0, 4) },
    });
    budgetIds[category] = b.id;
    for (const stage of ["draft", "pending-review", "finance-review", "manager-review"] as const) {
      await api("/finance/budget-approval-steps/decide", c.finance.token, {
        method: "POST",
        body: { budgetId: b.id, stage, decision: "approved", actor: c.finance.name },
      });
    }
  }

  // Milestones (dated, active) and the task plan.
  const span = Math.max(60, Math.round((Date.parse(c.p.due) - Date.parse(c.p.plannedStartDate)) / 86_400_000));
  const milestoneIds: number[] = [];
  const nMilestones = opts.complete ? 4 : 3;
  for (let m = 0; m < nMilestones; m++) {
    const ms = await api<{ id: number }>("/milestones", pm.token, {
      method: "POST",
      body: {
        projectCode: c.code,
        title: TASK_PLAN[m]!.milestone,
        description: `${TASK_PLAN[m]!.milestone} for ${c.p.subtitle}.`,
        estimatedCompletionDate: addDays(c.p.plannedStartDate, Math.round((span * (m + 1)) / 4)),
      },
    });
    await api(`/milestones/${ms.id}`, pm.token, { method: "PATCH", body: { status: "active" } });
    milestoneIds.push(ms.id);
  }

  // Tasks: for a complete plan every milestone gets tasks; for S3 only the first milestone does.
  const taskIds: { id: number; idx: number; assignee: Account }[] = [];
  const planMilestones = opts.complete ? nMilestones : 1;
  let idx = 0;
  for (let m = 0; m < planMilestones; m++) {
    for (const title of TASK_PLAN[m]!.tasks) {
      if (idx >= opts.taskCount) break;
      // Engineers can plan tasks but only site personnel can move them, so only a pending S4 task is engineer-owned.
      const engineerOwned = c.code === "DEMO-S4" && idx === 9;
      const assignee = engineerOwned ? c.team.engineer! : (c.team.site ?? c.team.engineer!);
      const t = await api<{ id: number }>("/tasks", pm.token, {
        method: "POST",
        body: {
          taskCode: `TSK-${c.code.replace("DEMO-", "")}-${String(idx + 1).padStart(2, "0")}`,
          projectCode: c.code,
          title,
          description: `${title} - ${c.p.subtitle}`,
          priority: (["High", "Medium", "Low"] as const)[idx % 3],
          status: "Pending",
          progress: 0,
          dueDate: addDays(c.p.plannedStartDate, Math.round(((idx + 1) * span) / 17)),
          assignedToUserId: assignee.id,
          assignedToName: assignee.name,
          milestoneId: milestoneIds[m],
        },
      });
      taskIds.push({ id: t.id, idx, assignee });
      idx += 1;
    }
  }

  if (opts.complete) {
    await docRecord(c, "Notice to Proceed", "Notice to Proceed", pm);
  }
  await api(`/projects/${c.projectId}`, pm.token, {
    method: "PATCH",
    body: { siteLatitude: c.p.lat, siteLongitude: c.p.lng, geofenceRadiusM: c.p.geofenceRadiusM },
  });
  void architect;
  return { budgetIds, milestoneIds, taskIds };
}

interface Built {
  budgetIds: Record<string, number>;
  milestoneIds: number[];
  taskIds: { id: number; idx: number; assignee: Account }[];
}

async function completeTask(c: Ctx, t: Built["taskIds"][number], withPhoto: boolean) {
  // Only site personnel may move a task (tasks/routes.ts), so completed tasks are always site-assigned.
  const who = t.assignee;
  await api(`/tasks/${t.id}/status`, who.token, { method: "PATCH", body: { status: "In Progress" } }).catch(() => {});
  let fileUrl: string | undefined;
  if (withPhoto) {
    const f = await png(who, `${c.code}-task-${t.idx + 1}-evidence.png`, [c.code, `TASK ${t.idx + 1} COMPLETE`, "SITE PHOTO", "2026"], t.idx);
    fileUrl = f.url;
  }
  await api(`/tasks/${t.id}/status`, who.token, {
    method: "PATCH",
    body: { status: "Completed", completionNote: "Work completed and checked against the drawings with the foreman.", completionFileUrl: fileUrl },
  });
}

/** Construction content for S4: ~54% of tasks done, expenses, issues, and the Budget Change Request. */
async function buildConstructionPartial(c: Ctx, built: Built) {
  const { pm, engineer, site } = c.team;
  const eng = engineer!;
  const s = site!;
  void s;
  // 7 of the first 13 tasks done; two in progress.
  const done = built.taskIds.filter((t) => t.idx < 7);
  for (const t of done) await completeTask(c, t, t.idx % 3 === 0);
  for (const t of built.taskIds.filter((t) => t.idx === 7 || t.idx === 8)) {
    await api(`/tasks/${t.id}/status`, t.assignee.token, { method: "PATCH", body: { status: "In Progress" } });
  }
  // Foundation milestone closed.
  await api(`/milestones/${built.milestoneIds[0]}`, pm.token, { method: "PATCH", body: { status: "completed" } });

  // Approved expenses (real spend against the matching budget lines); a large one so burn runs ahead of completion.
  const expenses: [string, string, number][] = [
    ["Holcim Ready-Mix Concrete", "Materials", 15_800_000],
    ["Steel Asia Rebar Supply", "Materials", 11_700_000],
    ["Pasig Manpower Services", "Labor", 17_400_000],
    ["Hi-Lift Equipment Rental", "Equipment", 8_900_000],
    ["Site Contingency (dewatering)", "Contingency", 2_300_000],
  ];
  for (const [i, [vendor, category, amount]] of expenses.entries()) {
    const receipt = await pdf(c.finance, `${c.code}-receipt-${i + 1}.pdf`, `Official Receipt - ${vendor}`, [`Vendor: ${vendor}`, `Project: ${c.code}`, `Category: ${category}`, `Amount: PHP ${amount.toLocaleString("en-PH")}`]);
    const ex = await api<{ id: string }>("/finance/expenses", c.finance.token, {
      method: "POST",
      body: { vendor, project: c.code, category, amount, receiptUrl: receipt.url },
    });
    await api(`/finance/expenses/${ex.id}/approve`, c.finance.token, { method: "PATCH", body: {} });
  }

  // Extra approved budget line (change order, filed under "Other": the managed category list has no Change Order) pushing planned ~10% over the contract value.
  const co = await api<{ id: number }>("/finance/budgets", c.finance.token, {
    method: "POST",
    body: { project: c.code, category: "Other", owner: c.finance.name, planned: Math.round(c.p.contractValue * 0.105), fiscalYear: "2026" },
  });
  for (const stage of ["draft", "pending-review", "finance-review", "manager-review"] as const) {
    await api("/finance/budget-approval-steps/decide", c.finance.token, {
      method: "POST",
      body: { budgetId: co.id, stage, decision: "approved", actor: c.finance.name },
    });
  }

  // Issues: 3 Material in the last 30 days (one resolved with a note) + open Quality/Safety items.
  const issues: [string, string, string, "Material" | "Quality" | "Safety", boolean][] = [
    ["ISS-S4-01", "Cracked batch of floor tiles", "Delivered tile batch for level 1 had visible cracking on pallets 3 and 4.", "Material", true],
    ["ISS-S4-02", "Rebar delivery below specified diameter", "Spot check of the latest rebar delivery found bars under the specified 16 mm diameter.", "Material", false],
    ["ISS-S4-03", "Honeycombing at column base C4", "Voids found at the base of column C4 after formwork removal.", "Material", false],
    ["ISS-S4-04", "Scaffold base plates missing on grid B", "Two scaffold bays on grid B are missing base plates; work paused in that bay.", "Safety", false],
  ];
  for (const [code, title, description, category, resolve] of issues) {
    const i = await api<{ id: number }>("/issues", eng.token, {
      method: "POST",
      body: { issueCode: code, projectCode: c.code, title, description, category, severity: category === "Safety" ? "High" : "Medium", reportedByName: eng.name },
    });
    if (resolve) {
      await api(`/issues/${i.id}/status`, pm.token, {
        method: "PATCH",
        body: { status: "Resolved", resolutionNotes: "Replaced with a batch from a different supplier; defective pallets returned for credit." },
      });
    }
  }

  // Budget Change Request through the real validateWorkflowLineItems() path.
  const templates = await api<{ id: number; name: string }[]>("/workflows/templates", eng.token);
  const bcrTemplate = templates.find((t) => t.name === "Budget Change Request")!;
  const bcr = await api<{ id: number; aiNote: string | null; stages: { id: number; role: string; status: string }[]; lineItems: { description: string; validation: { verdict: string; basisSummary: string } | null }[] }>("/workflows", eng.token, {
    method: "POST",
    body: {
      title: `Budget change - slab and concrete quantities (${c.code})`,
      projectCode: c.code,
      templateId: bcrTemplate.id,
      budgetId: built.budgetIds["Materials"],
      lineItems: [
        { category: "materials", description: "Ready-mix concrete (3000-4000 PSI), delivered", currentAmount: 0, requestedAmount: 95_000, quantity: 10, unit: "cy" },
        { category: "materials", description: "Concrete slab, poured and finished", currentAmount: 0, requestedAmount: 500_000, quantity: 500, unit: "sqft" },
        { category: "other", description: "Miscellaneous sitework contingency", currentAmount: 0, requestedAmount: 20_000 },
      ],
    },
  });
  console.log(`    Budget Change Request ${bcr.id}; aiNote: ${bcr.aiNote}`);
  for (const li of bcr.lineItems) console.log(`      "${li.description}" -> ${li.validation ? `${li.validation.verdict}: ${li.validation.basisSummary}` : "(no validation)"}`);
  // Stalled-stage signal: the current stage has been waiting ~50 hours.
  const current = bcr.stages.find((st) => st.status === "current");
  if (current) await pool.query("UPDATE workflow_stages SET updated_at = now() - interval '50 hours' WHERE id = $1", [current.id]);
  return { bcrId: bcr.id };
}

/** Everything done: used by S5-S7 so advance() to Closeout is legitimate. */
async function buildConstructionComplete(c: Ctx, built: Built) {
  const { pm } = c.team;
  for (const t of built.taskIds) await completeTask(c, t, t.idx % 4 === 0);
  for (const m of built.milestoneIds) await api(`/milestones/${m}`, pm.token, { method: "PATCH", body: { status: "completed" } });
  const eng = c.team.engineer!;
  const i = await api<{ id: number }>("/issues", eng.token, {
    method: "POST",
    body: { issueCode: `ISS-${c.code.replace("DEMO-", "")}-01`, projectCode: c.code, category: "Quality", severity: "Low", title: "Minor rebar spacing deviation", description: "Spacing on grid line 4 slightly out of tolerance, corrected on site.", reportedByName: eng.name },
  });
  await api(`/issues/${i.id}/status`, pm.token, { method: "PATCH", body: { status: "Resolved", resolutionNotes: "Re-inspected and corrected on site before the pour." } });
}

/** X1-X4. `pendingTail` leaves X3 (payroll) and X4 (Closeout workflow) pending. */
async function buildCloseout(c: Ctx, pendingTail: boolean) {
  const { pm, engineer } = c.team;
  const eng = engineer!;
  const report = await api<{ id: number }>("/engineering-reports", eng.token, {
    method: "POST",
    body: {
      title: `Final inspection - ${c.p.subtitle}`,
      type: "Final Inspection",
      project: c.code,
      location: c.p.location,
      date: pendingTail ? "2026-09-28" : addDays(c.p.due, -10),
      engineer: eng.name,
      description: "Final walkthrough of the completed works with the client's representative.",
      findings: "All systems inspected and functioning as designed; punch-list items closed out.",
      recommendations: "Approve for closeout and turnover.",
    },
  });
  await api(`/engineering-reports/${report.id}`, pm.token, { method: "PATCH", body: { status: "Approved" } });
  await docRecord(c, "Certificate of Completion", "Certificate of Completion", pm);

  const templates = await api<{ id: number; name: string }[]>("/workflows/templates", eng.token);
  const tpl = templates.find((t) => t.name === "Project Closeout")!;
  const wf = await api<{ id: number }>("/workflows", eng.token, {
    method: "POST",
    body: { title: `Project closeout - ${c.p.subtitle}`, projectCode: c.code, templateId: tpl.id },
  });
  const roleToken: Record<string, string> = { "finance-manager": c.finance.token, "project-manager": pm.token, admin: c.admin.token };
  // Pending tail: only Finance has signed; the PM stage is where it sits.
  const roles = pendingTail ? (["finance-manager"] as const) : (["finance-manager", "project-manager", "admin"] as const);
  for (const role of roles) {
    const view = await api<{ stages: { id: number; role: string; status: string }[] }>(`/workflows/${wf.id}`, pm.token);
    const stage = view.stages.find((s) => s.role === role && s.status === "current");
    if (!stage) continue;
    await api(`/workflows/${wf.id}/stages/${stage.id}/decision`, roleToken[role]!, { method: "PATCH", body: { decision: "approve" } });
  }

  const employeeId = (c.team.site ?? c.s.site).employeeId!;
  const payroll = await api<{ batch: { id: string } }>("/payroll/generate", c.hr.token, {
    method: "POST",
    body: { period: `Closeout ${c.code}`, projectCode: c.code, entries: [{ employeeId, hoursWorked: 64 }], submit: true },
  });
  if (!pendingTail) {
    await api(`/finance/payroll-review/${payroll.batch.id}/decide`, c.finance.token, {
      method: "POST",
      body: { decision: "approved", reviewedBy: c.finance.name },
    });
  }
  return { payrollBatchId: payroll.batch.id };
}

// ── Backdating (direct SQL: no API writes history timestamps) ──────────────
const HISTORY_DATES: Record<string, Record<string, string>> = {
  "DEMO-S1": { created: "2026-09-21" },
  "DEMO-S2": { created: "2026-06-08", Design: "2026-08-03" },
  "DEMO-S3": { created: "2026-03-02", Design: "2026-04-27", "Pre-Construction": "2026-07-13" },
  "DEMO-S4": { created: "2025-10-06", Design: "2025-11-24", "Pre-Construction": "2026-01-12", Construction: "2026-02-09" },
  "DEMO-S5": { created: "2025-04-07", Design: "2025-05-19", "Pre-Construction": "2025-07-14", Construction: "2025-09-08", Closeout: "2026-09-14" },
  "DEMO-S6": { created: "2024-10-07", Design: "2024-11-25", "Pre-Construction": "2025-01-13", Construction: "2025-03-10", Closeout: "2026-03-16", Completed: "2026-04-27" },
  "DEMO-S7": { created: "2024-01-08", Design: "2024-02-19", "Pre-Construction": "2024-04-01", Construction: "2024-06-10", Closeout: "2025-04-14", Completed: "2025-05-26", Archived: "2025-11-24" },
};

async function backdate(c: Ctx) {
  const d = HISTORY_DATES[c.code]!;
  await pool.query("UPDATE projects SET created_at = $2 WHERE code = $1", [c.code, `${d.created} 09:00`]);
  for (const [phase, date] of Object.entries(d)) {
    if (phase === "created") continue;
    await pool.query("UPDATE project_phase_history SET created_at = $3 WHERE project_code = $1 AND to_status = $2", [c.code, phase, `${date} 09:30`]);
  }
  if (d.Completed) await pool.query("UPDATE projects SET completed_at = $2 WHERE code = $1", [c.code, `${d.Completed} 15:00`]);
  if (d.Archived) await pool.query("UPDATE projects SET archived_at = $2 WHERE code = $1", [c.code, `${d.Archived} 10:00`]);
  // Closeout payroll batches were created inside the Closeout window.
  const closeoutAt = d.Closeout;
  if (closeoutAt) {
    const stop = d.Completed ?? TODAY;
    await pool.query("UPDATE payroll_batches SET created_at = $2 WHERE project_code = $1", [c.code, `${addDays(closeoutAt, d.Completed ? 10 : 3)} 11:00`]);
    void stop;
  }
}

// ── Orchestration ──────────────────────────────────────────────────────────

async function gateReport(c: Ctx) {
  const view = await api<{ phase: string; progress: number; canAdvance: boolean; checks: { key: string; passed: boolean }[] }>(`/projects/${c.projectId}/lifecycle`, c.team.pm.token);
  return view;
}

async function advance(c: Ctx) {
  return api(`/projects/${c.projectId}/lifecycle/advance`, c.team.pm.token, { method: "POST", body: {} });
}

async function buildProject(s: Session, p: DemoProject) {
  const code = p.code;
  const team = TEAMS[code]!;
  const acc = (k?: keyof Session) => (k ? s[k] : undefined);
  const resolved = { pm: s[team.pm], architect: s[team.architect], consultant: s[team.consultant], engineer: acc(team.engineer), site: acc(team.site) };
  const pm = resolved.pm;

  // Create with today's date (the create validator forbids past dates), then PATCH the real dates.
  const created = await api<{ id: number }>("/projects", pm.token, {
    method: "POST",
    body: {
      name: p.name,
      code,
      pm: pm.name,
      plannedStartDate: TODAY,
      due: "2027-12-31",
      client: p.client,
      projectType: p.projectType,
      location: p.location,
      description: `${p.subtitle}. ${p.description}`.slice(0, 500),
      contractValue: p.contractValue,
      siteLatitude: p.lat,
      siteLongitude: p.lng,
      geofenceRadiusM: p.geofenceRadiusM,
    },
  });
  await api(`/projects/${created.id}`, pm.token, {
    method: "PATCH",
    body: { plannedStartDate: p.plannedStartDate, due: p.due, scopeSummary: p.description },
  });
  const c: Ctx = { p, code, projectId: created.id, s, team: resolved, finance: s.finance, hr: s.hr, admin: s.admin };
  step(`Created ${code} (id ${created.id}) — PM ${pm.name}`);
  await staff(c);
  const phaseIdx = DEMO_PROJECTS.findIndex((x) => x.code === code);

  step("Proposal phase");
  await buildProposal(c, phaseIdx > 0);
  if (phaseIdx === 0) return c;
  await advance(c);

  step("Design phase");
  await buildDesign(c, phaseIdx > 1);
  if (phaseIdx === 1) return c;
  await advance(c);

  step("Pre-Construction phase");
  const isS3 = phaseIdx === 2;
  const taskCount = phaseIdx === 3 ? 13 : isS3 ? 4 : 16;
  const built = await buildPreConstruction(c, { complete: !isS3, taskCount });
  if (isS3) return c;
  await advance(c);

  step("Construction phase");
  if (phaseIdx === 3) {
    await buildConstructionPartial(c, built);
    return c;
  }
  await buildConstructionComplete(c, built);
  await advance(c);

  step("Closeout phase");
  await buildCloseout(c, phaseIdx === 4);
  if (phaseIdx === 4) return c;
  await advance(c);
  if (phaseIdx === 5) return c;

  step("Archive (Admin)");
  await api(`/projects/${created.id}/lifecycle/archive`, s.admin.token, { method: "POST", body: {} });
  return c;
}

async function main() {
  await ensureReferenceRows();
  const s = await openSession();
  const existing = await api<{ id: number; code: string; status: string }[]>("/projects", s.admin.token);
  const summary: { code: string; target: string; phase: string; progress: number; gates: string }[] = [];

  for (const p of DEMO_PROJECTS) {
    console.log(`\n=== ${p.code} · ${p.name} → ${p.phase} ===`);
    const found = existing.find((x) => x.code === p.code);
    let ctx: Ctx | null = null;
    const rebuild = (process.env.REBUILD ?? "").split(",").includes(p.code);
    if (found && found.status === p.phase && !rebuild) {
      console.log(`  already at ${p.phase} (id ${found.id}) — left as is`);
      ctx = { p, code: p.code, projectId: found.id, s, team: { pm: s[TEAMS[p.code]!.pm], architect: s[TEAMS[p.code]!.architect], consultant: s[TEAMS[p.code]!.consultant] }, finance: s.finance, hr: s.hr, admin: s.admin };
    } else {
      if (found) {
        console.log(`  found at ${found.status}, expected ${p.phase} — removing and rebuilding`);
        await cleanup(p.code);
      }
      ctx = await buildProject(s, p);
      await backdate(ctx);
      await api(`/projects/${ctx.projectId}/lifecycle`, ctx.team.pm.token).catch(() => null);
    }
    const view = await gateReport(ctx);
    summary.push({
      code: p.code,
      target: p.phase,
      phase: view.phase,
      progress: view.progress,
      gates: view.checks.map((k) => `${k.key}:${k.passed ? "✓" : "✗"}`).join(" "),
    });
  }

  console.log("\n=== Summary ===");
  console.table(summary);
}

main()
  .catch((err) => {
    console.error("\n✘ demo-seed-stages failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    setTimeout(() => process.exit(process.exitCode ?? 0), 250);
  });
