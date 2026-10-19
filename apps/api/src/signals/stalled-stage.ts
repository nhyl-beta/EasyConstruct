// apps/api/src/signals/stalled-stage.ts — NEW (ai-signals D7)
//
// Adds DURATION on top of what gates.ts's K4 already reports (K4: "there
// are active workflows"; this: "and one has sat at the same stage for N
// hours") — never just restates that a workflow exists.
import type { Signal, SignalContext, SignalRule } from "./types.js";
import type { LifecycleSnapshot } from "../lifecycle/repository.js";
import { SIGNAL_THRESHOLDS } from "../config/signals.js";

const STALLABLE_STATUSES = new Set(["current", "revision-required"]);

export const stalledStageRule: SignalRule = {
  rule: "stalled-stage",
  phases: ["Proposal", "Design", "Pre-Construction", "Construction", "Closeout"],
  evaluate(s: LifecycleSnapshot, ctx: SignalContext): Signal[] {
    const activeWorkflowIds = new Set(s.workflows.filter((w) => w.status === "active").map((w) => w.id));
    const workflowById = new Map(s.workflows.map((w) => [w.id, w]));
    const signals: Signal[] = [];

    for (const stage of s.workflowStages) {
      if (!activeWorkflowIds.has(stage.workflowId)) continue;
      if (!STALLABLE_STATUSES.has(stage.status)) continue;
      if (stage.updatedAt == null) continue;

      const hours = (ctx.now.getTime() - new Date(stage.updatedAt).getTime()) / (1000 * 60 * 60);
      if (hours < SIGNAL_THRESHOLDS.stalledStage.warnHours) continue;

      const workflow = workflowById.get(stage.workflowId);
      if (!workflow) continue;

      // A "revision-required" stage waits on whoever raised the workflow to
      // fix it — the workflow's stage-1 role, not the reviewer who sent it
      // back (who has already acted).
      const ownerRole =
        stage.status === "revision-required"
          ? s.workflowStages.find((st) => st.workflowId === stage.workflowId && st.sequence === 1)?.role ?? stage.role
          : stage.role;

      const severity = hours >= SIGNAL_THRESHOLDS.stalledStage.criticalHours ? "critical" : "warn";
      const days = Math.floor(hours / 24);
      const durationText = days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : `${Math.round(hours)} hour(s)`;

      signals.push({
        key: `stalled-stage:${workflow.code}:${stage.id}`,
        rule: "stalled-stage",
        label: `${workflow.title} (${workflow.code}) has been at ${stage.roleLabel} for ${durationText}`,
        ownerRoles: [ownerRole],
        severity,
        detail: `Stage "${stage.roleLabel}" (${stage.status}) on ${workflow.code} has not moved in ${hours.toFixed(1)} hours.`,
        link: "/workflows",
      });
    }

    return signals;
  },
};
