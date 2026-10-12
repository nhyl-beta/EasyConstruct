// server/src/signals/index.ts — NEW (ai-signals D8)
import type { LifecycleSnapshot } from "../lifecycle/repository.js";
import type { Signal, SignalContext, SignalRule } from "./types.js";
import { costVarianceRule } from "./cost-variance.js";
import { cumulativeChangeImpactRule } from "./cumulative-change-impact.js";
import { burnVsProgressRule } from "./burn-vs-progress.js";
import { issueRecurrenceRule } from "./issue-recurrence.js";
import { stalledStageRule } from "./stalled-stage.js";
import { projectedFinishRule } from "./projected-finish.js";
import { FEATURES } from "../config/features.js";

const RULES: SignalRule[] = [
  costVarianceRule,
  cumulativeChangeImpactRule,
  burnVsProgressRule,
  issueRecurrenceRule,
  stalledStageRule,
  projectedFinishRule,
];

const SEVERITY_ORDER: Record<Signal["severity"], number> = { critical: 0, warn: 1, info: 2 };

// Pure and testable with no flag/DB dependency — evaluateSignals below is
// the flag-gated entry point every real caller uses.
export const runSignals = (
  snapshot: LifecycleSnapshot,
  ctx: SignalContext,
  rules: SignalRule[] = RULES,
): Signal[] => {
  const results: Signal[] = [];

  for (const rule of rules) {
    if (!(rule.phases as readonly string[]).includes(snapshot.project.status)) continue;
    try {
      const outcome = rule.evaluate(snapshot, ctx);
      if (!outcome) continue;
      results.push(...(Array.isArray(outcome) ? outcome : [outcome]));
    } catch (error) {
      // A broken rule loses only itself — every other rule still runs, and
      // decision support never fails a request over this.
      console.error(`[signals] rule "${rule.rule}" threw:`, error);
    }
  }

  return results.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
};

export const evaluateSignals = (snapshot: LifecycleSnapshot, now: Date = new Date()): Signal[] => {
  if (!FEATURES.ai) return [];
  return runSignals(snapshot, { now });
};

export type { Signal, SignalContext, SignalRule, Severity, SignalSource } from "./types.js";
