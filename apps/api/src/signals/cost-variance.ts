// apps/api/src/signals/cost-variance.ts — NEW (ai-signals D3)
//
// Pure. Reads validationResults already on the snapshot — never queries the
// database or the reference client itself. Only above/below-typical rows
// raise a signal; within-range and no-match are informational only and
// surface solely as the line-item badge (see ai-validation/ Group C/E).
import type { Signal, SignalContext, SignalRule } from "./types.js";
import type { LifecycleSnapshot } from "../lifecycle/repository.js";
import { SIGNAL_THRESHOLDS } from "../config/signals.js";

const RECENT_WORKFLOW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const costVarianceRule: SignalRule = {
  rule: "cost-variance",
  phases: ["Construction"],
  evaluate(s: LifecycleSnapshot, ctx: SignalContext): Signal[] {
    const workflowById = new Map(s.workflows.map((w) => [w.id, w]));
    const signals: Signal[] = [];

    for (const result of s.validationResults) {
      if (result.verdict !== "above-typical" && result.verdict !== "below-typical") continue;
      const workflow = workflowById.get(result.workflowId);
      if (!workflow) continue;

      const isRecentlyFinished =
        workflow.status !== "active" &&
        workflow.updatedAt != null &&
        ctx.now.getTime() - new Date(workflow.updatedAt).getTime() <= RECENT_WORKFLOW_WINDOW_MS;
      if (workflow.status !== "active" && !isRecentlyFinished) continue;

      const variancePct = result.variancePct != null ? Number(result.variancePct) : null;
      if (variancePct == null) continue;
      const absPct = Math.abs(variancePct);
      if (absPct < SIGNAL_THRESHOLDS.costVariance.warnPct) continue;

      const severity = absPct >= SIGNAL_THRESHOLDS.costVariance.criticalPct ? "critical" : "warn";
      const sign = variancePct > 0 ? "+" : "";
      const pctDisplay = `${sign}${(variancePct * 100).toFixed(1)}%`;

      signals.push({
        key: `cost-variance:${result.id}`,
        rule: "cost-variance",
        label: `${pctDisplay} vs typical market cost — ${result.lineDescription} (${workflow.code})`,
        ownerRoles: ["finance-manager", "project-manager"],
        severity,
        detail: result.basisSummary,
        link: "/workflows",
        sources: (result.sources as Signal["sources"]) ?? undefined,
      });
    }

    return signals;
  },
};
