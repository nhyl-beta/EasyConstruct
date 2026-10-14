// server/src/lifecycle/gates.ts — NEW
//
// Every gate check as a pure function over a LifecycleSnapshot (see
// lifecycle/repository.ts loadSnapshot) — no database access in this file,
// so every check is unit-testable with a hand-built snapshot (see
// lifecycle/gates.test.ts). Section numbers/keys match the spec exactly
// (docs/lifecycle-progress.md group C reference, section 4.3).
import type { LifecycleSnapshot } from "./repository.js";
import type { SequencedPhase } from "./phases.js";
import { deliverableForDiscipline, normalizeDeliveryType } from "./delivery.js";

export interface GateCheck {
  key: string;
  label: string;
  ownerRoles: string[];
  passed: boolean;
  detail?: string;
  link?: string;
}

const projectLink = (snapshot: LifecycleSnapshot, path: string) =>
  `/projects/${encodeURIComponent(snapshot.project.code)}${path}`;

// ── Proposal ─────────────────────────────────────────────────────────────

const p1 = (s: LifecycleSnapshot): GateCheck => {
  const has = s.members.some((m) => m.role === "architect");
  return {
    key: "P1",
    label: "Architect staffed",
    ownerRoles: ["project-manager"],
    passed: has,
    detail: has ? "Architect staffed" : "No architect staffed on this project",
    link: projectLink(s, ""),
  };
};

const p2 = (s: LifecycleSnapshot): GateCheck => {
  const has = s.members.some((m) => m.role === "consultant");
  return {
    key: "P2",
    label: "Consultant staffed",
    ownerRoles: ["project-manager"],
    passed: has,
    detail: has ? "Consultant staffed" : "No consultant staffed on this project",
    link: projectLink(s, ""),
  };
};

const p3 = (s: LifecycleSnapshot): GateCheck => {
  const linked = s.proposals.filter((p) => p.workflowId != null);
  return {
    key: "P3",
    label: "Proposal submitted",
    ownerRoles: ["architect"],
    passed: linked.length > 0,
    detail: linked.length > 0 ? `${linked.length} proposal(s) submitted` : "No proposal submitted yet",
    link: "/proposals",
  };
};

const p4 = (s: LifecycleSnapshot): GateCheck => {
  const linked = s.proposals.filter((p) => p.workflowId != null);
  const completed = linked.filter((p) =>
    s.proposalWorkflows.some((w) => w.id === p.workflowId && w.status === "completed"),
  );
  return {
    key: "P4",
    label: "Proposal approved",
    ownerRoles: ["consultant", "project-manager"],
    passed: linked.length > 0 && completed.length > 0,
    detail:
      linked.length === 0
        ? "No proposal submitted yet"
        : `${completed.length} of ${linked.length} proposal(s) approved`,
    link: "/proposals",
  };
};

const P5_TYPES = ["Notice of Award", "Contract"] as const;

const p5 = (s: LifecycleSnapshot): GateCheck => {
  const types = new Set(s.documents.map((d) => d.type));
  const hasBoth = P5_TYPES.every((t) => types.has(t));
  const contractValue = Number(s.project.contractValue ?? 0);
  const passed = hasBoth && contractValue > 0;
  const missing = P5_TYPES.filter((t) => !types.has(t));
  return {
    key: "P5",
    label: "Award & contract on file",
    ownerRoles: ["project-manager", "admin"],
    passed,
    detail: passed
      ? "Notice of Award and Contract on file, contract value set"
      : [
          missing.length > 0 ? `Missing: ${missing.join(", ")}` : null,
          contractValue <= 0 ? "Contract value is not set" : null,
        ]
          .filter(Boolean)
          .join("; "),
    link: projectLink(s, ""),
  };
};

const evaluateProposal = (s: LifecycleSnapshot): GateCheck[] => [p1(s), p2(s), p3(s), p4(s), p5(s)];

// ── Design ───────────────────────────────────────────────────────────────

const d1 = (s: LifecycleSnapshot): GateCheck => {
  const staffedEngineerIds = new Set(
    s.members.filter((m) => m.role === "engineer").map((m) => m.userId),
  );
  const has = s.designs.some(
    (d) =>
      Array.isArray(d.fileUrls) &&
      d.fileUrls.length > 0 &&
      d.assignedEngineerId != null &&
      staffedEngineerIds.has(d.assignedEngineerId),
  );
  return {
    key: "D1",
    label: "Design with files, assigned to a staffed engineer",
    ownerRoles: ["architect", "project-manager"],
    passed: has,
    detail: has
      ? "A design with files is assigned to a staffed engineer"
      : "No design yet has files and an engineer staffed on this project",
    link: "/designs",
  };
};

const d2 = (s: LifecycleSnapshot): GateCheck => {
  if (s.designs.length === 0) {
    return {
      key: "D2",
      label: "All designs approved",
      ownerRoles: ["consultant", "project-manager"],
      passed: false,
      detail: "No design exists yet",
      link: "/designs",
    };
  }
  const allApproved = s.designs.every((d) => d.status === "Approved");
  const designIds = new Set(s.designs.map((d) => d.id));
  const hasPendingReview = s.designReviews.some(
    (r) => designIds.has(r.designId) && r.status === "Pending",
  );
  const passed = allApproved && !hasPendingReview;
  return {
    key: "D2",
    label: "All designs approved",
    ownerRoles: ["consultant", "project-manager"],
    passed,
    detail: passed
      ? "Every design is Approved and no review is pending"
      : !allApproved
        ? `${s.designs.filter((d) => d.status !== "Approved").length} of ${s.designs.length} design(s) not yet Approved`
        : "A design review is still pending",
    link: "/designs",
  };
};

const d3 = (s: LifecycleSnapshot): GateCheck => {
  const has = s.blueprints.some((b) => b.approval === "Approved" && b.status === "Current");
  return {
    key: "D3",
    label: "Approved current blueprint",
    ownerRoles: ["architect"],
    passed: has,
    detail: has ? "An approved, current blueprint is on file" : "No approved, current blueprint yet",
    link: "/blueprints",
  };
};

const evaluateDesign = (s: LifecycleSnapshot): GateCheck[] => [d1(s), d2(s), d3(s)];

// ── Pre-Construction ─────────────────────────────────────────────────────

const REQUIREMENT_GATE_CATEGORIES = ["Materials", "Specifications"] as const;

const c1 = (s: LifecycleSnapshot): GateCheck => {
  const relevant = s.requirements.filter((r) =>
    (REQUIREMENT_GATE_CATEGORIES as readonly string[]).includes(r.category),
  );
  const unresolved = relevant.filter((r) => r.status === "Draft" || r.status === "Under Review");
  const approvedByCategory = (category: string) =>
    relevant.some((r) => r.category === category && r.status === "Approved");
  const passed =
    unresolved.length === 0 &&
    REQUIREMENT_GATE_CATEGORIES.every((category) => approvedByCategory(category));
  return {
    key: "C1",
    label: "Materials & specifications approved",
    ownerRoles: ["engineer", "project-manager"],
    passed,
    detail: passed
      ? "Materials and Specifications requirements are approved"
      : unresolved.length > 0
        ? `${unresolved.length} requirement(s) still Draft/Under Review`
        : `No approved ${REQUIREMENT_GATE_CATEGORIES.filter((category) => !approvedByCategory(category)).join(" or ")} requirement yet (both a Materials and a Specifications requirement must be approved)`,
    link: "/requirements",
  };
};

const c2 = (s: LifecycleSnapshot): GateCheck => {
  const allApproved = s.budgets.length > 0 && s.budgets.every((b) => b.status === "approved");
  const totalPlanned = s.budgets.reduce((sum, b) => sum + Number(b.planned), 0);
  const passed = allApproved && totalPlanned > 0;
  return {
    key: "C2",
    label: "Budget approved",
    ownerRoles: ["finance-manager"],
    passed,
    detail: passed
      ? "Every budget line is approved and planned total is set"
      : s.budgets.length === 0
        ? "No budget lines yet"
        : !allApproved
          ? `${s.budgets.filter((b) => b.status !== "approved").length} of ${s.budgets.length} budget line(s) not yet approved`
          : "Planned budget total is zero",
    link: "/budget",
  };
};

const c3 = (s: LifecycleSnapshot): GateCheck => {
  const hasMilestones = s.milestones.length > 0;
  const allHaveDates = s.milestones.every((m) => !!m.estimatedCompletionDate);
  const noneDraft = s.milestones.every((m) => m.status !== "draft");
  const hasActive = s.milestones.some((m) => m.status === "active");
  const passed = hasMilestones && allHaveDates && noneDraft && hasActive;
  return {
    key: "C3",
    label: "Milestones dated and active",
    ownerRoles: ["project-manager"],
    passed,
    detail: passed
      ? "Milestones are dated and active"
      : !hasMilestones
        ? "No milestones yet"
        : !allHaveDates
          ? "A milestone is missing its estimated completion date"
          : !noneDraft
            ? "A milestone is still in draft"
            : "No milestone is active yet",
    link: projectLink(s, ""),
  };
};

const c4 = (s: LifecycleSnapshot): GateCheck => {
  const siteWorkers = s.members.filter((m) => m.role === "site-personnel");
  const employeeByUserId = new Map(s.staffedEmployees.map((e) => [e.userId, e]));
  const missingEmployeeLink = siteWorkers.filter((m) => {
    const employee = employeeByUserId.get(m.userId);
    return !employee || employee.status !== "Active";
  });

  const hasTasks = s.tasks.length > 0;

  const activeMilestones = s.milestones.filter((m) => m.status === "active");
  const staffedSiteWorkerIds = new Set(siteWorkers.map((m) => m.userId));
  const taskLinksByMilestone = new Map<number, number[]>();
  for (const link of s.milestoneLinks) {
    if (link.linkType !== "task") continue;
    const list = taskLinksByMilestone.get(link.milestoneId) ?? [];
    list.push(link.linkId);
    taskLinksByMilestone.set(link.milestoneId, list);
  }
  const taskById = new Map(s.tasks.map((t) => [t.id, t]));
  const milestonesMissingStaffedTask = activeMilestones.filter((m) => {
    const taskIds = taskLinksByMilestone.get(m.id) ?? [];
    return !taskIds.some((taskId) => {
      const task = taskById.get(taskId);
      return task?.assignedToUserId != null && staffedSiteWorkerIds.has(task.assignedToUserId);
    });
  });

  const passed =
    siteWorkers.length > 0 &&
    missingEmployeeLink.length === 0 &&
    hasTasks &&
    milestonesMissingStaffedTask.length === 0;

  const details: string[] = [];
  if (siteWorkers.length === 0) details.push("No site personnel staffed");
  if (missingEmployeeLink.length > 0) {
    details.push(
      `Missing an Active employee record or login: ${missingEmployeeLink.map((m) => m.userName).join(", ")}`,
    );
  }
  if (!hasTasks) details.push("No tasks created yet");
  if (milestonesMissingStaffedTask.length > 0) {
    details.push(
      `Active milestone(s) with no task assigned to a staffed site worker: ${milestonesMissingStaffedTask
        .map((m) => m.title)
        .join(", ")}`,
    );
  }

  return {
    key: "C4",
    label: "Site crew staffed and linked to tasks",
    ownerRoles: ["project-manager", "engineer", "human-resources", "it-designer"],
    passed,
    detail: passed ? "Site crew is staffed, active, and linked to tasks" : details.join("; "),
    link: "/tasks",
  };
};

const c5 = (s: LifecycleSnapshot): GateCheck => {
  const hasNtp = s.documents.some((d) => d.type === "Notice to Proceed");
  const hasCoords = s.project.siteLatitude != null && s.project.siteLongitude != null;
  const passed = hasNtp && hasCoords;
  return {
    key: "C5",
    label: "Notice to Proceed & site location",
    ownerRoles: ["project-manager"],
    passed,
    detail: passed
      ? "Notice to Proceed is on file and the site location is set"
      : [
          !hasNtp ? "Notice to Proceed document is missing" : null,
          !hasCoords ? "Site latitude/longitude is not set" : null,
        ]
          .filter(Boolean)
          .join("; "),
    link: projectLink(s, ""),
  };
};

const evaluatePreConstruction = (s: LifecycleSnapshot): GateCheck[] => [c1(s), c2(s), c3(s), c4(s), c5(s)];

// ── Construction (exit checks — progress comes from tasks) ─────────────────

const k1 = (s: LifecycleSnapshot): GateCheck => {
  const passed = s.tasks.length > 0 && s.tasks.every((t) => t.status === "Completed");
  return {
    key: "K1",
    label: "All tasks completed",
    ownerRoles: ["site-personnel"],
    passed,
    detail: passed
      ? "All tasks are completed"
      : s.tasks.length === 0
        ? "No tasks created yet"
        : `${s.tasks.filter((t) => t.status !== "Completed").length} of ${s.tasks.length} task(s) still open`,
    link: "/tasks",
  };
};

const k2 = (s: LifecycleSnapshot): GateCheck => {
  const passed =
    s.milestones.length > 0 &&
    s.milestones.every((m) => m.status === "completed" || m.status === "cancelled");
  return {
    key: "K2",
    label: "All milestones closed",
    ownerRoles: ["project-manager"],
    passed,
    detail: passed
      ? "Every milestone is completed or cancelled"
      : `${s.milestones.filter((m) => m.status !== "completed" && m.status !== "cancelled").length} milestone(s) still open`,
    link: projectLink(s, ""),
  };
};

const k3 = (s: LifecycleSnapshot): GateCheck => {
  const open = s.issues.filter((i) => i.status === "Submitted" || i.status === "Under Review");
  return {
    key: "K3",
    label: "No open issues",
    ownerRoles: ["engineer", "project-manager"],
    passed: open.length === 0,
    detail: open.length === 0 ? "No open issues" : `${open.length} open issue(s)`,
    link: "/issues",
  };
};

const k4 = (s: LifecycleSnapshot): GateCheck => {
  const active = s.workflows.filter((w) => w.status === "active");
  const currentRoles = new Set<string>();
  for (const w of active) {
    const stage = s.workflowStages.find((st) => st.workflowId === w.id && st.status === "current");
    if (stage) currentRoles.add(stage.role);
  }
  return {
    key: "K4",
    label: "No active workflows",
    ownerRoles: currentRoles.size > 0 ? Array.from(currentRoles) : ["project-manager"],
    passed: active.length === 0,
    detail: active.length === 0 ? "No active workflows" : `${active.length} active workflow(s)`,
    link: "/workflows",
  };
};

const evaluateConstructionExit = (s: LifecycleSnapshot): GateCheck[] => [k1(s), k2(s), k3(s), k4(s)];

// ── Closeout ─────────────────────────────────────────────────────────────

const x1 = (s: LifecycleSnapshot): GateCheck => {
  const has = s.engineeringReports.some(
    (r) => r.type === "Final Inspection" && r.status === "Approved",
  );
  return {
    key: "X1",
    label: "Final inspection approved",
    ownerRoles: ["engineer", "project-manager"],
    passed: has,
    detail: has ? "Final Inspection report is approved" : "No approved Final Inspection report yet",
    link: "/reports",
  };
};

const x2 = (s: LifecycleSnapshot): GateCheck => {
  const has = s.documents.some((d) => d.type === "Certificate of Completion");
  return {
    key: "X2",
    label: "Certificate of Completion on file",
    ownerRoles: ["project-manager", "admin"],
    passed: has,
    detail: has ? "Certificate of Completion is on file" : "Certificate of Completion is missing",
    link: projectLink(s, ""),
  };
};

const x3 = (s: LifecycleSnapshot): GateCheck => {
  const enteredCloseout = s.phaseHistory.find((h) => h.toStatus === "Closeout");
  const enteredAt = enteredCloseout?.createdAt ?? null;
  const approvedAfterEntry = s.payrollBatches.some(
    (b) =>
      b.status === "approved" &&
      (!enteredAt || (b.createdAt != null && new Date(b.createdAt) > new Date(enteredAt))),
  );
  const anyPending = s.payrollBatches.some((b) => b.status === "pending");
  const passed = approvedAfterEntry && !anyPending;
  return {
    key: "X3",
    label: "Closeout payroll approved",
    ownerRoles: ["human-resources", "finance-manager"],
    passed,
    detail: passed
      ? "Closeout payroll is approved with none pending"
      : [
          !approvedAfterEntry ? "No payroll batch approved since entering Closeout" : null,
          anyPending ? "A payroll batch is still pending" : null,
        ]
          .filter(Boolean)
          .join("; "),
    link: "/payroll",
  };
};

const x4 = (s: LifecycleSnapshot): GateCheck => {
  const closeoutWorkflows =
    s.closeoutTemplateId == null
      ? []
      : s.workflows.filter((w) => w.templateId === s.closeoutTemplateId);
  const passed = closeoutWorkflows.some((w) => w.status === "completed");
  const activeCloseoutWorkflowIds = new Set(
    closeoutWorkflows.filter((w) => w.status === "active").map((w) => w.id),
  );
  const currentStage = s.workflowStages.find(
    (st) => st.status === "current" && activeCloseoutWorkflowIds.has(st.workflowId),
  );
  return {
    key: "X4",
    label: "Project Closeout workflow completed",
    ownerRoles: currentStage ? [currentStage.role] : ["project-manager"],
    passed,
    detail: passed ? "Project Closeout workflow is completed" : "Project Closeout workflow is not completed yet",
    link: "/workflows",
  };
};

// X5 — an unanswered RFI/RFA hard-blocks closing the project. (Named X5 because it
// belongs to the Closeout exit; the K-series is the Construction exit.)
export const noOpenRequestsCheck = (s: LifecycleSnapshot, key: string): GateCheck => {
  const open = s.openRequests ?? [];
  return {
    key,
    label: "No open RFI/RFA",
    ownerRoles: ["project-manager", "admin"],
    passed: open.length === 0,
    detail:
      open.length === 0
        ? "No open RFI/RFA"
        : `${open.length} open request(s): ${open.slice(0, 3).map((r) => r.number).join(", ")}${open.length > 3 ? "…" : ""}`,
    link: "/requests",
  };
};

const x5 = (s: LifecycleSnapshot): GateCheck => noOpenRequestsCheck(s, "X5");

// Money still in flight blocks closing: a purchase request waiting or approved but
// not yet ordered, or an order not yet paid or cancelled. `unsettledPurchasing` is the ids, listed by the snapshot
// loader with the rules in finance/purchasing/rules.ts.
export const noUnsettledPurchasingCheck = (s: LifecycleSnapshot, key: string): GateCheck => {
  const open = s.unsettledPurchasing ?? [];
  return {
    key,
    label: "No unsettled procurement",
    ownerRoles: ["project-manager", "admin", "finance-manager"],
    passed: open.length === 0,
    detail:
      open.length === 0
        ? "Every purchase request and order is settled"
        : `${open.length} unsettled: ${open.slice(0, 3).join(", ")}${open.length > 3 ? "…" : ""}`,
    link: "/expenses",
  };
};

const x6 = (s: LifecycleSnapshot): GateCheck => noUnsettledPurchasingCheck(s, "X6");

const evaluateCloseout = (s: LifecycleSnapshot): GateCheck[] => [x1(s), x2(s), x3(s), x4(s), x5(s), x6(s)];

// ── Design delivery (plan sets only) ──────────────────────────────────────
//
// A Design project goes Proposal -> Design -> Turnover (stored as "Closeout").
// Proposal keeps P1-P5. The rest are its own checks; Construction projects
// never reach this code (see evaluateGate).

const dp1 = (s: LifecycleSnapshot): GateCheck => {
  const sets = s.deliverables ?? [];
  const missingLead = sets.filter((d) => d.leadUserId == null);
  const passed = sets.length > 0 && missingLead.length === 0;
  return {
    key: "DP1",
    label: "Every plan set has a lead",
    ownerRoles: ["architect", "project-manager"],
    passed,
    detail: passed
      ? `${sets.length} plan set(s), each with a lead`
      : sets.length === 0
        ? "No plan sets yet"
        : `No lead on: ${missingLead.map((d) => d.discipline).join(", ")}`,
    link: projectLink(s, ""),
  };
};

const dp2 = (s: LifecycleSnapshot): GateCheck => {
  const sets = s.deliverables ?? [];
  const withFiles = (discipline: string) =>
    s.designs.some(
      (d) => deliverableForDiscipline(d.discipline) === discipline && Array.isArray(d.fileUrls) && d.fileUrls.length > 0,
    );
  const missing = sets.filter((d) => !withFiles(d.discipline));
  const passed = sets.length > 0 && missing.length === 0;
  return {
    key: "DP2",
    label: "Every plan set has a design with files",
    ownerRoles: ["architect"],
    passed,
    detail: passed
      ? "Every plan set has a design with files"
      : sets.length === 0
        ? "No plan sets yet"
        : `No design with files for: ${missing.map((d) => d.discipline).join(", ")}`,
    link: "/designs",
  };
};

const evaluateDesignDeliveryDesign = (s: LifecycleSnapshot): GateCheck[] => [
  dp1(s),
  dp2(s),
  d2(s),
  d3(s),
  noOpenRequestsCheck(s, "D4"),
];

const t1 = (s: LifecycleSnapshot): GateCheck => {
  const has = s.documents.some((d) => d.type === "Turnover Document");
  return {
    key: "T1",
    label: "Turnover document on file",
    ownerRoles: ["architect", "project-manager"],
    passed: has,
    detail: has ? "Turnover Document is on file" : "Turnover Document is missing",
    link: projectLink(s, ""),
  };
};

const t2 = (s: LifecycleSnapshot): GateCheck => {
  const has = s.documents.some((d) => d.type === "Client Acceptance");
  return {
    key: "T2",
    label: "Client acceptance on file",
    ownerRoles: ["project-manager", "admin"],
    passed: has,
    detail: has ? "Client Acceptance is on file" : "Client Acceptance document is missing",
    link: projectLink(s, ""),
  };
};

const t3 = (s: LifecycleSnapshot): GateCheck => {
  const turnover = s.designTurnoverTemplateId == null ? [] : s.workflows.filter((w) => w.templateId === s.designTurnoverTemplateId);
  const passed = turnover.some((w) => w.status === "completed");
  const activeIds = new Set(turnover.filter((w) => w.status === "active").map((w) => w.id));
  const current = s.workflowStages.find((st) => st.status === "current" && activeIds.has(st.workflowId));
  return {
    key: "T3",
    label: "Design Turnover workflow completed",
    ownerRoles: current ? [current.role] : ["architect"],
    passed,
    detail: passed ? "Design Turnover workflow is completed" : "Design Turnover workflow is not completed yet",
    link: "/workflows",
  };
};

const evaluateDesignDeliveryTurnover = (s: LifecycleSnapshot): GateCheck[] => [
  t1(s),
  t2(s),
  t3(s),
  noOpenRequestsCheck(s, "T4"),
  noUnsettledPurchasingCheck(s, "T5"),
];

const evaluateDesignDelivery = (phase: SequencedPhase, s: LifecycleSnapshot): GateCheck[] => {
  switch (phase) {
    case "Proposal":
      return evaluateProposal(s);
    case "Design":
      return evaluateDesignDeliveryDesign(s);
    case "Closeout":
      return evaluateDesignDeliveryTurnover(s);
    default:
      return [];
  }
};

export const evaluateGate = (phase: SequencedPhase, snapshot: LifecycleSnapshot): GateCheck[] => {
  if (normalizeDeliveryType(snapshot.project.deliveryType) === "Design") return evaluateDesignDelivery(phase, snapshot);
  switch (phase) {
    case "Proposal":
      return evaluateProposal(snapshot);
    case "Design":
      return evaluateDesign(snapshot);
    case "Pre-Construction":
      return evaluatePreConstruction(snapshot);
    case "Construction":
      return evaluateConstructionExit(snapshot);
    case "Closeout":
      return evaluateCloseout(snapshot);
    case "Completed":
    case "Archived":
      return [];
  }
};
