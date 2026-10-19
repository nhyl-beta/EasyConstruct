// apps/api/src/signals/cumulative-change-impact.ts — NEW (ai-signals D4)
import type { Signal, SignalContext, SignalRule } from "./types.js";
import type { LifecycleSnapshot } from "../lifecycle/repository.js";
import { SIGNAL_THRESHOLDS } from "../config/signals.js";

export const cumulativeChangeImpactRule: SignalRule = {
  rule: "cumulative-change-impact",
  phases: ["Construction", "Closeout"],
  evaluate(s: LifecycleSnapshot, _ctx: SignalContext): Signal | null {
    const contractValue = Number(s.project.contractValue ?? 0);
    if (contractValue <= 0) return null;

    const totalPlanned = s.budgets.reduce((sum, b) => sum + Number(b.planned), 0);
    if (totalPlanned <= contractValue) return null;

    const diff = totalPlanned - contractValue;
    const pct = diff / contractValue;
    if (pct < SIGNAL_THRESHOLDS.cumulativeChange.warnPct) return null;

    const severity = pct >= SIGNAL_THRESHOLDS.cumulativeChange.criticalPct ? "critical" : "warn";
    const pctDisplay = `+${(pct * 100).toFixed(1)}%`;

    return {
      key: `cumulative-change-impact:${s.project.code}`,
      rule: "cumulative-change-impact",
      label: `Approved changes total ${pctDisplay} over contract value`,
      ownerRoles: ["project-manager", "finance-manager"],
      severity,
      detail: `Budget planned ${formatPhp(totalPlanned)} against a contract value of ${formatPhp(contractValue)} — a difference of ${formatPhp(diff)}.`,
      link: "/budget",
    };
  },
};

const formatPhp = (n: number): string => `₱${Math.round(n).toLocaleString("en-PH")}`;
