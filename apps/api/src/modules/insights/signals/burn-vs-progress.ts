// apps/api/src/signals/burn-vs-progress.ts — NEW (ai-signals D5)
//
// Uses task completion, not projects.progress, as the "how much is actually
// done" side — progress includes the phase-band offset (Construction starts
// at 30%, see lifecycle/phases.ts PHASE_BANDS), which would make burn look
// artificially closer to completion than it is.
import type { Signal, SignalContext, SignalRule } from "./types.js";
import type { LifecycleSnapshot } from "../../projects/index.js";
import { SIGNAL_THRESHOLDS } from "../../../core/config/signals.js";

export const burnVsProgressRule: SignalRule = {
  rule: "burn-vs-progress",
  phases: ["Construction"],
  evaluate(s: LifecycleSnapshot, _ctx: SignalContext): Signal | null {
    const totalPlanned = s.budgets.reduce((sum, b) => sum + Number(b.planned), 0);
    if (totalPlanned <= 0) return null;
    if (s.tasks.length === 0) return null;

    const totalActual = s.budgets.reduce((sum, b) => sum + Number(b.actual), 0);
    const burnPct = (totalActual / totalPlanned) * 100;

    const completedTasks = s.tasks.filter((t) => t.status === "Completed").length;
    const completionPct = (completedTasks / s.tasks.length) * 100;

    const divergence = burnPct - completionPct;
    if (divergence < SIGNAL_THRESHOLDS.burnVsProgress.warnPoints) return null;

    const severity = divergence >= SIGNAL_THRESHOLDS.burnVsProgress.criticalPoints ? "critical" : "warn";

    return {
      key: `burn-vs-progress:${s.project.code}`,
      rule: "burn-vs-progress",
      label: `${Math.round(burnPct)}% of budget consumed at ${Math.round(completionPct)}% of tasks complete`,
      ownerRoles: ["project-manager", "finance-manager"],
      severity,
      detail: `Budget: ${formatPhp(totalActual)} spent of ${formatPhp(totalPlanned)} planned (${burnPct.toFixed(1)}%). Tasks: ${completedTasks} of ${s.tasks.length} completed (${completionPct.toFixed(1)}%).`,
      link: "/budget",
    };
  },
};

const formatPhp = (n: number): string => `₱${Math.round(n).toLocaleString("en-PH")}`;
