// apps/api/src/signals/types.ts — NEW (ai-signals D1)
//
// A Signal deliberately mirrors GateCheck (lifecycle/gates.ts) minus
// `passed` — it grades, it never gates. Label and detail must be built from
// the same variables so the explanation can't drift from the number (the
// honesty rule from docs/ai-signals-progress.md section 1).
export type Severity = "info" | "warn" | "critical";

export interface SignalSource {
  source: string;
  itemName: string;
  sourceUrl: string | null;
  fetchedAt: string;
  fxRate?: number;
  fxAsOf?: string;
}

/** What a person could do about a signal, from the playbook; precedents are similar resolved issues. */
export interface SuggestedResolution {
  action: string;
  precedents?: import("../issues/precedents.js").RankedPrecedent[];
}

export interface Signal {
  key: string;
  rule: string;
  label: string;
  ownerRoles: string[];
  severity: Severity;
  detail: string;
  link?: string;
  sources?: SignalSource[];
  /** Advice on what to do next. Never applied automatically. */
  suggestedResolution?: SuggestedResolution;
}

export interface SignalContext {
  now: Date;
}

export interface SignalRule {
  rule: string;
  phases: readonly string[];
  evaluate(s: import("../lifecycle/repository.js").LifecycleSnapshot, ctx: SignalContext): Signal | Signal[] | null;
}
