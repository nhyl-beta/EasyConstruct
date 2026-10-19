// apps/api/src/lifecycle/service.ts — NEW
import {
  ConflictError,
  ForbiddenError,
  GateBlockedError,
  NotFoundError,
} from "../../../core/utils/errors.js";
import { logAudit } from "../../../core/audit/audit.js";
import { notificationsService } from "../../platform/index.js";
import * as projectsRepo from "../projects/repository.js";
import * as repo from "./repository.js";
import type { LifecycleSnapshot } from "./repository.js";
import { evaluateGate, type GateCheck } from "./gates.js";
import {
  HOLDABLE_PHASES,
  PHASE_BANDS,
  PHASE_TONE,
  SEQUENCED_PHASES,
  WRITE_LOCKED_PHASES,
  isSequencedPhase,
  type ProjectPhase,
  type SequencedPhase,
} from "./phases.js";
import { evaluateSignals, type Signal } from "../../insights/index.js";
import {
  DESIGN_BANDS,
  DESIGN_PHASES,
  designProgress,
  nextPhaseFor,
  normalizeDeliveryType,
  phaseLabel as phaseLabelFor,
  planSetAverage,
  type DeliveryType,
} from "./delivery.js";
import { FEATURES } from "../../../core/config/features.js";

export interface LifecycleActor {
  id: number;
  name: string;
  role: string;
}

// ── Progress ─────────────────────────────────────────────────────────────

export const computeProgress = (phase: string, snapshot: LifecycleSnapshot): number => {
  // Design delivery: Proposal 0-10, Design 10-90 (plan-set average), Turnover 90-99.
  if (normalizeDeliveryType(snapshot.project.deliveryType) === "Design") {
    const dp = designProgress(phase, snapshot.deliverables ?? [], isSequencedPhase(phase) ? evaluateGate(phase, snapshot) : []);
    if (dp != null) return dp;
  }
  if (phase === "Construction") {
    // Tasks and live milestones (active / at-risk / completed) are the units
    // of work, so completing a milestone moves the percentage. Drafts and
    // cancelled milestones are not commitments and are not counted.
    const milestones = (snapshot.milestones ?? []).filter(
      (m) => m.status === "active" || m.status === "at-risk" || m.status === "completed",
    );
    const total = snapshot.tasks.length + milestones.length;
    if (total === 0) return 30;
    const done =
      snapshot.tasks.filter((t) => t.status === "Completed").length +
      milestones.filter((m) => m.status === "completed").length;
    return Math.round(30 + 65 * (done / total));
  }
  if (phase === "Completed" || phase === "Archived") return 100;
  if (phase === "On Hold" || phase === "Cancelled") return snapshot.project.progress;

  if (!isSequencedPhase(phase)) return snapshot.project.progress;
  const band = PHASE_BANDS[phase];
  const checks = evaluateGate(phase, snapshot);
  if (checks.length === 0) return band.start;
  const passed = checks.filter((c) => c.passed).length;
  return Math.round(band.start + (band.end - band.start) * (passed / checks.length));
};

/** The only writer of projects.progress — every other write path calls this
 * after it succeeds (see docs/lifecycle-progress.md group C7's call-site
 * list) instead of setting progress itself. */
export const refreshProjectProgress = async (projectCode: string): Promise<void> => {
  const snapshot = await repo.loadSnapshot(projectCode);
  if (!snapshot) return;
  const progress = computeProgress(snapshot.project.status, snapshot);
  if (progress === snapshot.project.progress) return;
  await projectsRepo.updateLifecycleFields(projectCode, { progress });
};

// ── Read ─────────────────────────────────────────────────────────────────

export interface LifecycleView {
  /** "Construction" (full path) or "Design" (Proposal -> Design -> Turnover). */
  deliveryType: DeliveryType;
  /** The phases this project passes through, in order, and how each is labelled. */
  phasePath: { phase: SequencedPhase; label: string }[];
  /** Design projects: how far the plan sets are (average status points, 0-100). */
  planSets?: { total: number; averagePoints: number };
  phase: ProjectPhase;
  progress: number;
  band: { start: number; end: number } | null;
  checks: GateCheck[];
  nextPhase: SequencedPhase | null;
  canAdvance: boolean;
  blockedReason?: string;
  constructionTasks?: { done: number; total: number };
  history: Awaited<ReturnType<typeof repo.findPhaseHistory>>;
  /** D6: a rejected proposal in Proposal phase offers "Mark bid lost" (→ /cancel). */
  hasRejectedProposal?: boolean;
  /** ai-signals E1: present only when FEATURES.ai is on — omitted entirely
   * (not an empty array) when the flag is off, so the client can tell "no
   * advisories" apart from "decision support isn't enabled". */
  signals?: Signal[];
}

export const getLifecycleView = async (projectCode: string): Promise<LifecycleView> => {
  const snapshot = await repo.loadSnapshot(projectCode);
  if (!snapshot) throw new NotFoundError("Project", projectCode);

  const phase = snapshot.project.status as ProjectPhase;
  const sequenced = isSequencedPhase(phase);
  const checks = sequenced ? evaluateGate(phase, snapshot) : [];
  const deliveryType = normalizeDeliveryType(snapshot.project.deliveryType);
  const nextPhase = sequenced ? nextPhaseFor(deliveryType, phase) : null;
  // Completed's "next" is Archived, but that's reached via POST .../archive
  // (Admin only), not Advance — see D-1's table.
  const advanceEligible = sequenced && phase !== "Completed" && phase !== "Archived" && nextPhase != null;
  const allPassed = checks.every((c) => c.passed);
  const canAdvance = advanceEligible && allPassed;

  const history = await repo.findPhaseHistory(projectCode);

  const designBand = deliveryType === "Design" && sequenced ? (DESIGN_BANDS as Record<string, { start: number; end: number }>)[phase] : undefined;
  const pathPhases: readonly SequencedPhase[] = deliveryType === "Design" ? DESIGN_PHASES : SEQUENCED_PHASES;
  const view: LifecycleView = {
    deliveryType,
    phasePath: pathPhases.map((p) => ({ phase: p, label: phaseLabelFor(deliveryType, p) })),
    phase,
    progress: snapshot.project.progress,
    band: sequenced ? (designBand ?? PHASE_BANDS[phase]) : null,
    checks,
    nextPhase: advanceEligible ? nextPhase : null,
    canAdvance,
    history,
  };

  if (!canAdvance) {
    view.blockedReason = !advanceEligible
      ? `${phase} has no Advance step`
      : `${checks.filter((c) => !c.passed).length} check(s) not yet passing`;
  }

  if (deliveryType === "Design") {
    const sets = snapshot.deliverables ?? [];
    view.planSets = { total: sets.length, averagePoints: Math.round(planSetAverage(sets)) };
  }

  if (phase === "Construction") {
    view.constructionTasks = {
      done: snapshot.tasks.filter((t) => t.status === "Completed").length,
      total: snapshot.tasks.length,
    };
  }

  if (phase === "Proposal") {
    view.hasRejectedProposal = snapshot.proposals.some(
      (p) => p.workflowId != null && snapshot.proposalWorkflows.some((w) => w.id === p.workflowId && w.status === "rejected"),
    );
  }

  // ai-signals E1: evaluateSignals itself returns [] when FEATURES.ai is
  // off, but the view must OMIT the key in that case (not send an empty
  // array) — the client tells "flag off" apart from "flag on, nothing to
  // report" by whether this key exists at all. See boundary.test.ts: this
  // is the one sanctioned import of ../signals in this file, and it only
  // appends a field here — it cannot affect canAdvance or checks above.
  if (FEATURES.ai) {
    view.signals = evaluateSignals(snapshot);
  }

  return view;
};

// ── H6: Closeout summary ────────────────────────────────────────────────

export interface CloseoutSummary {
  phase: ProjectPhase;
  checks: GateCheck[];
  documents: { certificateOfCompletion: boolean; asBuiltDrawing: boolean };
  budgets: { category: string; planned: number; committed: number; spent: number }[];
  payroll: { pending: number; approvedSinceCloseout: number };
  closeoutWorkflow: { status: string; currentStageRoleLabel: string | null } | null;
}

/** H6: one read-only rollup of everything Closeout cares about — the X1-X4
 * gate checks plus the underlying data behind each (documents, budgets,
 * payroll), so PM/Admin/Finance don't have to cross-reference four separate
 * screens to see what's still blocking the move to Completed. */
export const getCloseoutSummary = async (projectCode: string): Promise<CloseoutSummary> => {
  const snapshot = await repo.loadSnapshot(projectCode);
  if (!snapshot) throw new NotFoundError("Project", projectCode);

  const phase = snapshot.project.status as ProjectPhase;
  const checks = isSequencedPhase(phase) ? evaluateGate("Closeout", snapshot) : [];

  const enteredCloseout = snapshot.phaseHistory.find((h) => h.toStatus === "Closeout");
  const enteredAt = enteredCloseout?.createdAt ?? null;

  const closeoutWorkflows =
    snapshot.closeoutTemplateId == null
      ? []
      : snapshot.workflows.filter((w) => w.templateId === snapshot.closeoutTemplateId);
  const activeCloseout = closeoutWorkflows.find((w) => w.status === "active") ?? closeoutWorkflows[0] ?? null;
  const currentStage = activeCloseout
    ? snapshot.workflowStages.find((s) => s.workflowId === activeCloseout.id && s.status === "current")
    : undefined;

  return {
    phase,
    checks,
    documents: {
      certificateOfCompletion: snapshot.documents.some((d) => d.type === "Certificate of Completion"),
      asBuiltDrawing: snapshot.documents.some((d) => d.type === "As-Built Drawing"),
    },
    budgets: snapshot.budgets.map((b) => ({
      category: b.category,
      planned: Number(b.planned),
      committed: Number(b.committed),
      spent: Number(b.actual),
    })),
    payroll: {
      pending: snapshot.payrollBatches.filter((b) => b.status === "pending").length,
      approvedSinceCloseout: snapshot.payrollBatches.filter(
        (b) => b.status === "approved" && (!enteredAt || (b.createdAt != null && new Date(b.createdAt) > new Date(enteredAt))),
      ).length,
    },
    closeoutWorkflow: activeCloseout
      ? { status: activeCloseout.status, currentStageRoleLabel: currentStage?.roleLabel ?? null }
      : null,
  };
};

// ── Write guard ──────────────────────────────────────────────────────────

/** Blocks ordinary project-scoped writes while a project is frozen
 * (Archived/Cancelled/On Hold) — the lifecycle endpoints themselves
 * (advance/hold/resume/cancel/archive) are exempt by construction, since
 * they call projectsRepo.updateLifecycleFields directly rather than going
 * through any of the call sites this guards. */
export const assertProjectWritable = async (projectCode: string): Promise<void> => {
  const project = await projectsRepo.findByCode(projectCode);
  if (!project) throw new NotFoundError("Project", projectCode);
  if (WRITE_LOCKED_PHASES.has(project.status)) {
    throw new ConflictError(`Project is ${project.status} — changes are locked`);
  }
};

// ── Authorization ────────────────────────────────────────────────────────

const isProjectPm = (project: LifecycleSnapshot["project"], actor: LifecycleActor): boolean => {
  if (project.pmUserId != null) return project.pmUserId === actor.id;
  return project.pm === actor.name;
};

const assertCanAdvance = (project: LifecycleSnapshot["project"], actor: LifecycleActor): void => {
  if (actor.role === "admin") return;
  if (actor.role === "project-manager" && isProjectPm(project, actor)) return;
  throw new ForbiddenError("Only the project's own Project Manager, or Admin, may advance it");
};

const assertCanHold = assertCanAdvance; // same rule: PM of the project, or Admin

const assertCanCancel = (
  project: LifecycleSnapshot["project"],
  actor: LifecycleActor,
): void => {
  if (actor.role === "admin") return;
  // From Proposal, the PM may cancel too; from any later phase, Admin only.
  if (project.status === "Proposal" && actor.role === "project-manager" && isProjectPm(project, actor)) {
    return;
  }
  throw new ForbiddenError(
    project.status === "Proposal"
      ? "Only the project's own Project Manager, or Admin, may cancel it"
      : "Only Admin may cancel a project once it has left Proposal",
  );
};

// ── Notifications (4.5) ──────────────────────────────────────────────────
//
// J1: thin wrapper around notifications/service.notifyProject — every
// staffed role on the project, plus the PM.
const notifyProjectMembersAndPm = async (
  snapshot: LifecycleSnapshot,
  title: string,
  body: string,
) => {
  const roles = [...new Set(snapshot.members.map((m) => m.role)), "project-manager"];
  await notificationsService.notifyProject(snapshot.project.code, roles, {
    title,
    body,
    link: `/projects/${encodeURIComponent(snapshot.project.code)}`,
  });
};

const notifyEnteringPhase = async (snapshot: LifecycleSnapshot, phase: SequencedPhase) => {
  const checks = evaluateGate(phase, snapshot);
  const rolesToChecks = new Map<string, GateCheck[]>();
  for (const check of checks) {
    for (const role of check.ownerRoles) {
      const list = rolesToChecks.get(role) ?? [];
      list.push(check);
      rolesToChecks.set(role, list);
    }
  }
  const link = `/projects/${encodeURIComponent(snapshot.project.code)}`;
  // Each role's own gate checks give it its own body text, so this is one
  // notifyProject call per role rather than a single multi-role call — but
  // still routed through it (not a bare recipientRole broadcast) so a
  // staffable role like "engineer" reaches the engineer(s) actually staffed
  // on this project, not every engineer in the org.
  await Promise.all(
    Array.from(rolesToChecks.entries()).map(([role, roleChecks]) =>
      notificationsService.notifyProject(snapshot.project.code, [role], {
        title: `Project entering ${phase}`,
        body: `${snapshot.project.code}: ${roleChecks.map((c) => c.label).join(", ")} needed.`,
        link,
      }),
    ),
  );
};

// ── Transitions ──────────────────────────────────────────────────────────

const recordTransition = async (
  snapshot: LifecycleSnapshot,
  toStatus: string,
  actor: LifecycleActor,
  opts: { reason?: string | null; override?: boolean; gateSnapshot?: unknown } = {},
) => {
  await repo.insertPhaseHistory({
    projectCode: snapshot.project.code,
    fromStatus: snapshot.project.status,
    toStatus,
    changedBy: actor.name,
    changedByUserId: actor.id,
    reason: opts.reason ?? null,
    override: opts.override ?? false,
    gateSnapshot: opts.gateSnapshot ?? null,
  });
  await logAudit({
    entityType: "project",
    entityId: snapshot.project.code,
    action: `lifecycle:${toStatus.toLowerCase().replace(/\s+/g, "-")}`,
    actor: actor.name,
    summary: `${snapshot.project.status} → ${toStatus}${opts.reason ? ` (${opts.reason})` : ""}`,
  });
};

export interface AdvanceInput {
  reason?: string;
  override?: boolean;
}

export const advance = async (
  projectCode: string,
  actor: LifecycleActor,
  input: AdvanceInput,
): Promise<LifecycleView> => {
  const snapshot = await repo.loadSnapshot(projectCode);
  if (!snapshot) throw new NotFoundError("Project", projectCode);

  const phase = snapshot.project.status;
  if (!isSequencedPhase(phase) || phase === "Completed" || phase === "Archived") {
    throw new ConflictError(`${phase} has no Advance step`);
  }
  assertCanAdvance(snapshot.project, actor);

  const nextPhase = nextPhaseFor(snapshot.project.deliveryType, phase);
  if (!nextPhase) throw new ConflictError(`${phase} has no next phase`);

  const checks = evaluateGate(phase, snapshot);
  const failing = checks.filter((c) => !c.passed);

  const isOverride = input.override === true;
  if (failing.length > 0) {
    if (!isOverride) throw new GateBlockedError(failing);
    // D-3: admin override — requires a reason of at least 10 characters,
    // and is recorded (override=true + the failing snapshot) in both the
    // history row and the audit log.
    if (actor.role !== "admin") {
      throw new ForbiddenError("Only Admin may override a blocked Advance");
    }
    if (!input.reason || input.reason.trim().length < 10) {
      throw new ConflictError("An override requires a reason of at least 10 characters");
    }
  }

  await recordTransition(snapshot, nextPhase, actor, {
    reason: input.reason ?? null,
    override: isOverride && failing.length > 0,
    gateSnapshot: checks,
  });
  await projectsRepo.updateLifecycleFields(projectCode, {
    status: nextPhase,
    statusTone: PHASE_TONE[nextPhase],
    ...(nextPhase === "Completed" ? { completedAt: new Date() } : {}),
  });
  // A Design project gets one plan set per discipline chosen at creation as it enters Design.
  if (normalizeDeliveryType(snapshot.project.deliveryType) === "Design" && nextPhase === "Design") {
    await repo.ensureDeliverables(projectCode, (snapshot.project.designDisciplines as string[] | undefined) ?? []);
  }
  await refreshProjectProgress(projectCode);

  const refreshed = await repo.loadSnapshot(projectCode);
  if (refreshed) {
    await notifyProjectMembersAndPm(
      refreshed,
      `Project advanced to ${nextPhase}`,
      `${snapshot.project.code} moved from ${phase} to ${nextPhase}.`,
    );
    if (isSequencedPhase(nextPhase) && nextPhase !== "Completed" && nextPhase !== "Archived") {
      await notifyEnteringPhase(refreshed, nextPhase);
    }
    if (nextPhase === "Completed") {
      await notificationsService.create({
        recipientRole: "owner",
        title: "Project completed",
        body: `${snapshot.project.code} reached 100% and is now Completed.`,
        link: `/projects/${encodeURIComponent(snapshot.project.code)}`,
        projectCode: snapshot.project.code,
      });
    }
  }

  return getLifecycleView(projectCode);
};

export interface HoldInput {
  reason: string;
}

export const hold = async (
  projectCode: string,
  actor: LifecycleActor,
  input: HoldInput,
): Promise<LifecycleView> => {
  const snapshot = await repo.loadSnapshot(projectCode);
  if (!snapshot) throw new NotFoundError("Project", projectCode);
  if (!HOLDABLE_PHASES.has(snapshot.project.status)) {
    throw new ConflictError(`Cannot hold a project in ${snapshot.project.status}`);
  }
  assertCanHold(snapshot.project, actor);
  if (!input.reason || !input.reason.trim()) {
    throw new ConflictError("A reason is required to hold a project");
  }

  await recordTransition(snapshot, "On Hold", actor, { reason: input.reason });
  await projectsRepo.updateLifecycleFields(projectCode, {
    status: "On Hold",
    statusTone: PHASE_TONE["On Hold"],
    previousStatus: snapshot.project.status,
    holdReason: input.reason,
  });

  const refreshed = await repo.loadSnapshot(projectCode);
  if (refreshed) {
    await notifyProjectMembersAndPm(
      refreshed,
      "Project put on hold",
      `${snapshot.project.code}: ${input.reason}`,
    );
  }

  return getLifecycleView(projectCode);
};

export const resume = async (projectCode: string, actor: LifecycleActor): Promise<LifecycleView> => {
  const snapshot = await repo.loadSnapshot(projectCode);
  if (!snapshot) throw new NotFoundError("Project", projectCode);
  if (snapshot.project.status !== "On Hold") {
    throw new ConflictError("Only a project that is On Hold can be resumed");
  }
  assertCanHold(snapshot.project, actor);

  const restoreTo = snapshot.project.previousStatus ?? "Construction";
  await recordTransition(snapshot, restoreTo, actor);
  await projectsRepo.updateLifecycleFields(projectCode, {
    status: restoreTo,
    statusTone: isSequencedPhase(restoreTo) ? PHASE_TONE[restoreTo] : "neutral",
    previousStatus: null,
    holdReason: null,
  });
  await refreshProjectProgress(projectCode);

  const refreshed = await repo.loadSnapshot(projectCode);
  if (refreshed) {
    await notifyProjectMembersAndPm(
      refreshed,
      "Project resumed",
      `${snapshot.project.code} resumed into ${restoreTo}.`,
    );
  }

  return getLifecycleView(projectCode);
};

export interface CancelInput {
  reason: string;
}

export const cancel = async (
  projectCode: string,
  actor: LifecycleActor,
  input: CancelInput,
): Promise<LifecycleView> => {
  const snapshot = await repo.loadSnapshot(projectCode);
  if (!snapshot) throw new NotFoundError("Project", projectCode);
  if (snapshot.project.status === "Cancelled" || snapshot.project.status === "Archived") {
    throw new ConflictError(`Project is already ${snapshot.project.status}`);
  }
  assertCanCancel(snapshot.project, actor);
  if (!input.reason || !input.reason.trim()) {
    throw new ConflictError("A reason is required to cancel a project");
  }

  await recordTransition(snapshot, "Cancelled", actor, { reason: input.reason });
  await projectsRepo.updateLifecycleFields(projectCode, {
    status: "Cancelled",
    statusTone: PHASE_TONE.Cancelled,
  });

  const refreshed = await repo.loadSnapshot(projectCode);
  if (refreshed) {
    await notifyProjectMembersAndPm(
      refreshed,
      "Project cancelled",
      `${snapshot.project.code}: ${input.reason}`,
    );
  }

  return getLifecycleView(projectCode);
};

export const archive = async (projectCode: string, actor: LifecycleActor): Promise<LifecycleView> => {
  if (actor.role !== "admin") throw new ForbiddenError("Only Admin may archive a project");

  const snapshot = await repo.loadSnapshot(projectCode);
  if (!snapshot) throw new NotFoundError("Project", projectCode);
  if (snapshot.project.status !== "Completed") {
    throw new ConflictError("Only a Completed project can be archived");
  }

  await recordTransition(snapshot, "Archived", actor);
  await projectsRepo.updateLifecycleFields(projectCode, {
    status: "Archived",
    statusTone: PHASE_TONE.Archived,
    archivedAt: new Date(),
  });

  const refreshed = await repo.loadSnapshot(projectCode);
  if (refreshed) {
    await notifyProjectMembersAndPm(
      refreshed,
      "Project archived",
      `${snapshot.project.code} has been archived.`,
    );
  }

  return getLifecycleView(projectCode);
};
