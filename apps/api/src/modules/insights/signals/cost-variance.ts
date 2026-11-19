// apps/api/src/signals/cost-variance.ts — NEW (ai-signals D3)
//
// Pure. Reads validationResults already on the snapshot — never queries the
// database or the reference client itself. Only above/below-typical rows
// raise a signal; within-range and no-match are informational only and
// surface solely as the line-item badge (see ai-validation/ Group C/E).
import type { Signal, SignalContext, SignalRule } from "./types.js";
import type { LifecycleSnapshot } from "../../projects/index.js";
import { SIGNAL_THRESHOLDS } from "../../../core/config/signals.js";

const RECENT_WORKFLOW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Statuses a Purchase Request is still "live" in — mirrors the pending/approved window a
// workflow's own `status === "active"` covers. StatusRow (s.purchaseRequests) carries no
// updatedAt, so unlike the workflow path below there's no "recently finished" grace window here.
const LIVE_PR_STATUSES = new Set(["pending-pm", "pending-finance", "approved"]);

// What a validation_results row's parent (a workflow or a Purchase Request) resolves to for
// display: a label suffix, whether it's still "live" enough to surface, and where to link.
// Returns null when the parent can't be resolved or isn't live, in which case the row is skipped.
const resolveParent = (
  result: LifecycleSnapshot["validationResults"][number],
  workflowById: Map<number, LifecycleSnapshot["workflows"][number]>,
  purchaseRequestById: Map<string, LifecycleSnapshot["purchaseRequests"][number]>,
  ctx: SignalContext,
): { codeLabel: string; link: string } | null => {
  if (result.workflowId != null) {
    const workflow = workflowById.get(result.workflowId);
    if (!workflow) return null;
    const isRecentlyFinished =
      workflow.status !== "active" &&
      workflow.updatedAt != null &&
      ctx.now.getTime() - new Date(workflow.updatedAt).getTime() <= RECENT_WORKFLOW_WINDOW_MS;
    if (workflow.status !== "active" && !isRecentlyFinished) return null;
    return { codeLabel: workflow.code, link: "/workflows" };
  }
  if (result.purchaseRequestId != null) {
    const request = purchaseRequestById.get(result.purchaseRequestId);
    if (!request || !LIVE_PR_STATUSES.has(request.status)) return null;
    return { codeLabel: request.id, link: "/expenses" };
  }
  return null;
};

export const costVarianceRule: SignalRule = {
  rule: "cost-variance",
  phases: ["Construction"],
  evaluate(s: LifecycleSnapshot, ctx: SignalContext): Signal[] {
    const workflowById = new Map(s.workflows.map((w) => [w.id, w]));
    const purchaseRequestById = new Map(s.purchaseRequests.map((r) => [r.id, r]));
    const signals: Signal[] = [];

    for (const result of s.validationResults) {
      if (result.verdict !== "above-typical" && result.verdict !== "below-typical") continue;
      const parent = resolveParent(result, workflowById, purchaseRequestById, ctx);
      if (!parent) continue;

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
        label: `${pctDisplay} vs typical market cost — ${result.lineDescription} (${parent.codeLabel})`,
        ownerRoles: ["finance-manager", "project-manager"],
        severity,
        detail: result.basisSummary,
        link: parent.link,
        sources: (result.sources as Signal["sources"]) ?? undefined,
      });
    }

    return signals;
  },
};
