// apps/api/src/lifecycle/my-actions.ts — NEW
//
// K1: "what's waiting on me, across every project" — the lifecycle gate
// checks (gates.ts) and getLifecycleView are deliberately single-project
// (they take one LifecycleSnapshot at a time); this is the cross-project
// rollup for one actor, mirroring gate checks' own ownerRoles against
// whichever projects that actor is actually relevant to, plus every
// workflow stage pending on them (workflows/repository.ts already answers
// that cross-project on its own).
//
// Lives in its own file rather than lifecycle/service.ts to avoid a circular
// import: workflows/service.ts already imports lifecycle/service.ts
// (assertProjectWritable/refreshProjectProgress), so this instead reads
// workflows/repository.ts directly — a leaf module neither side imports.
import { Router } from "express";
import { authenticate } from "../core/auth/middleware.js";
import type { AuthedRequest } from "../core/auth/middleware.js";
import { formatSuccess } from "../core/utils/response.js";
import { UnauthorizedError } from "../core/utils/errors.js";
import * as projectsRepo from "../projects/repository.js";
import * as projectMemberRepo from "../project-members/repository.js";
import * as workflowsRepo from "../workflows/repository.js";
import * as repo from "./repository.js";
import { evaluateGate } from "./gates.js";
import { isSequencedPhase, type SequencedPhase } from "./phases.js";
import { PROJECT_MEMBER_ROLES } from "../core/db/schema/project-members.js";
import { evaluateSignals } from "../signals/index.js";
import * as findingsRepo from "../signals/findings-repository.js";
import { findingKey } from "../signals/findings.js";
import { FEATURES } from "../core/config/features.js";
import { scopeRowsToAssigned } from "../projects/scope.js";
import { visibleProjectCodes } from "../projects/service.js";
import { ALL_DOMAIN, cached } from "../core/cache/index.js";
import { userScope } from "../core/cache/scope.js";

export interface MyActionItem {
  projectCode: string;
  projectName: string;
  kind: "gate" | "workflow" | "signal";
  title: string;
  detail: string;
  link: string;
  /** ai-signals E3: only present on kind "signal" — lets the card style it
   * distinctly from a gate/workflow item. */
  severity?: "warn" | "critical";
  /** Fix 3.5: what a person could do about it (playbook), with similar resolved issues when there are any. */
  suggestedResolution?: { action: string; precedents?: { issueCode: string; projectCode: string; title: string; resolutionNotes: string; score: number }[] };
  /** Fix 3.5: when the scheduled scan first saw this condition (ISO). Absent until a scan has run. */
  firstSeen?: string;
}

const TERMINAL_PHASES = new Set(["Archived", "Cancelled", "Completed"]);

const isMemberRole = (role: string): boolean =>
  (PROJECT_MEMBER_ROLES as readonly string[]).includes(role);

export const getMyActions = async (actor: {
  id: number;
  role: string;
}): Promise<MyActionItem[]> => {
  const allProjects = await projectsRepo.findAll({});
  const nameByCode = new Map(allProjects.map((p) => [p.code, p.name]));
  const active = allProjects.filter((p) => !TERMINAL_PHASES.has(p.status));

  let relevant = active;
  if (isMemberRole(actor.role)) {
    const memberships = await projectMemberRepo.findAll({ userId: actor.id });
    const codes = new Set(memberships.map((m) => m.projectCode));
    relevant = active.filter((p) => codes.has(p.code));
  } else if (actor.role === "project-manager") {
    relevant = active.filter((p) => p.pmUserId === actor.id);
  }
  // Every other role (admin, finance-manager, human-resources, it-designer,
  // owner) has no per-project staffing concept — every active project is in
  // scope, narrowed below to only the gate checks that role actually owns.

  // Fix 3.5: when the scheduled scan first saw each open finding. Best effort: the
  // queue works the same without it (for example before the table is migrated).
  const firstSeenByKey = new Map<string, string>();
  if (FEATURES.ai) {
    try {
      for (const f of await findingsRepo.findOpenForProjects(relevant.map((p) => p.code))) {
        firstSeenByKey.set(f.key, f.firstSeen.toISOString());
      }
    } catch (err) {
      console.error("[my-actions] could not read signal findings", err);
    }
  }

  const gateItems: MyActionItem[] = [];
  const signalItems: MyActionItem[] = [];
  const sequenced = relevant.filter((project) => isSequencedPhase(project.status));
  // One batched read for every project (the per-project loader ran ~17
  // queries per project on each dashboard load).
  const snapshots = await repo.loadSnapshots(sequenced.map((project) => project.code));
  for (const project of sequenced) {
    const snapshot = snapshots.get(project.code);
    if (!snapshot) continue;
    const checks = evaluateGate(project.status as SequencedPhase, snapshot);
    for (const check of checks) {
      if (check.passed || !check.ownerRoles.includes(actor.role)) continue;
      gateItems.push({
        projectCode: project.code,
        projectName: project.name,
        kind: "gate",
        title: check.label,
        detail: check.detail ?? "",
        link: check.link || `/projects/${encodeURIComponent(project.code)}`,
      });
    }

    // ai-signals E3: only warn/critical rise to "waiting on you" — info
    // signals are advisory-only even by decision-support standards and stay
    // on the project's own Decision Support section (E2).
    if (FEATURES.ai) {
      const signals = evaluateSignals(snapshot);
      for (const signal of signals) {
        if (signal.severity === "info" || !signal.ownerRoles.includes(actor.role)) continue;
        signalItems.push({
          projectCode: project.code,
          projectName: project.name,
          kind: "signal",
          title: signal.label,
          detail: signal.detail,
          link: signal.link || `/projects/${encodeURIComponent(project.code)}`,
          severity: signal.severity as "warn" | "critical",
          suggestedResolution: signal.suggestedResolution
            ? {
                action: signal.suggestedResolution.action,
                precedents: signal.suggestedResolution.precedents?.map((p) => ({
                  issueCode: p.issueCode,
                  projectCode: p.projectCode,
                  title: p.title,
                  resolutionNotes: p.resolutionNotes,
                  score: p.score,
                })),
              }
            : undefined,
          firstSeen: firstSeenByKey.get(findingKey(project.code, signal.key)),
        });
      }
    }
  }

  // Cross-project by construction — same "admin can decide any stage"
  // privilege decideStage itself grants (EC-003).
  const isPrivileged = actor.role === "admin";
  const pendingStages = await workflowsRepo.findPendingStagesForRole(actor.role, isPrivileged);
  const workflowItems: MyActionItem[] = pendingStages.map(({ stage, workflow }) => ({
    projectCode: workflow.projectCode,
    projectName: nameByCode.get(workflow.projectCode) ?? workflow.projectCode,
    kind: "workflow",
    title: workflow.title,
    detail: `Awaiting your ${stage.roleLabel} decision`,
    link: "/workflows",
  }));

  return [...gateItems, ...signalItems, ...workflowItems];
};

/**
 * Read-only "impact awareness": the decision-support signals (cost variance,
 * cumulative change, burn vs progress, issue recurrence, stalled stage) of every
 * active project the caller can see, for roles that watch impact without owning
 * the decision (Architect, Owner, IT Designer…). Rule-based, flag-gated by
 * FEATURE_AI, and it only reads: nothing here can change a project.
 */
export const getImpactAwareness = async (actor: { id: number; role: string; name: string }) => {
  if (!FEATURES.ai) return { enabled: false as const, projects: [] };
  const codes = await visibleProjectCodes({ role: actor.role, userId: actor.id, name: actor.name });
  const projects = (await projectsRepo.findAll({})).filter((p) => !TERMINAL_PHASES.has(p.status) && (codes === null || codes.has(p.code)));
  const out: { projectCode: string; projectName: string; phase: string; signals: ReturnType<typeof evaluateSignals> }[] = [];
  const snapshots = await repo.loadSnapshots(projects.map((project) => project.code));
  for (const project of projects) {
    const snapshot = snapshots.get(project.code);
    if (!snapshot) continue;
    const signals = evaluateSignals(snapshot);
    if (signals.length > 0) out.push({ projectCode: project.code, projectName: project.name, phase: project.status, signals });
  }
  return { enabled: true as const, projects: out };
};

const router = Router();
router.use(authenticate);

router.get("/impact", async (req: AuthedRequest, res, next) => {
  try {
    if (!req.authUser) throw new UnauthorizedError();
    const { id, role, name } = req.authUser;
    // Decision-support signals for every project the caller can see: per user,
    // invalidated by any write, 60 s.
    const data = await cached("lifecycle", userScope(req.authUser)!, 60, () => getImpactAwareness({ id, role, name }), {
      query: { kind: "impact" },
      deps: [ALL_DOMAIN],
    });
    res.json(formatSuccess(data, "Impact awareness retrieved"));
  } catch (err) {
    next(err);
  }
});

router.get("/my-actions", async (req: AuthedRequest, res, next) => {
  try {
    if (!req.authUser) throw new UnauthorizedError();
    const auth = req.authUser;
    // "What is waiting on me": gate checks and signals across every project,
    // the heaviest read behind the dashboards. Per user, invalidated by any
    // write anywhere, 60 s.
    const data = await cached(
      "lifecycle",
      userScope(auth)!,
      60,
      async () =>
        scopeRowsToAssigned(auth, await getMyActions({ id: auth.id, role: auth.role }), (item) => item.projectCode),
      { query: { kind: "my-actions" }, deps: [ALL_DOMAIN] },
    );
    res.json(formatSuccess(data, "Actions waiting on you retrieved"));
  } catch (err) {
    next(err);
  }
});

export default router;
