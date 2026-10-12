// Mirrors server/src/lifecycle/phases.ts (source of truth is the server —
// this is a display-layer copy, not re-derived from an API call).
export const PROJECT_PHASES = [
  "Proposal",
  "Design",
  "Pre-Construction",
  "Construction",
  "Closeout",
  "Completed",
  "Archived",
  "On Hold",
  "Cancelled",
] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export const SEQUENCED_PHASES = [
  "Proposal",
  "Design",
  "Pre-Construction",
  "Construction",
  "Closeout",
  "Completed",
  "Archived",
] as const;
export type SequencedPhase = (typeof SEQUENCED_PHASES)[number];

export interface GateCheck {
  key: string;
  label: string;
  ownerRoles: string[];
  passed: boolean;
  detail?: string;
  link?: string;
}

export interface PhaseHistoryEntry {
  id: number;
  projectCode: string;
  fromStatus: string;
  toStatus: string;
  changedBy: string;
  changedByUserId: number | null;
  reason: string | null;
  override: boolean;
  createdAt: string | null;
}

// ai-signals E1/E2: decision support, never a gate. See config/features.ts —
// present on LifecycleView only when the server's FEATURES.ai is on.
export type Severity = "info" | "warn" | "critical";

export interface SignalSource {
  source: string;
  itemName: string;
  sourceUrl: string | null;
  fetchedAt: string;
  fxRate?: number;
  fxAsOf?: string;
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
  /** Fix 3.5: playbook advice, with similar resolved issues when there are any. */
  suggestedResolution?: {
    action: string;
    precedents?: { issueCode: string; projectCode: string; title: string; resolutionNotes: string; score: number }[];
  };
}

export interface LifecycleView {
  /** "Design" projects skip Pre-Construction/Construction; their Closeout reads "Turnover". */
  deliveryType?: "Construction" | "Design";
  /** The phases this project passes through, in order, with their on-screen labels. */
  phasePath?: { phase: SequencedPhase; label: string }[];
  /** Design projects: plan-set summary (average status points 0-100). */
  planSets?: { total: number; averagePoints: number };
  phase: ProjectPhase;
  progress: number;
  band: { start: number; end: number } | null;
  checks: GateCheck[];
  nextPhase: SequencedPhase | null;
  canAdvance: boolean;
  blockedReason?: string;
  constructionTasks?: { done: number; total: number };
  history: PhaseHistoryEntry[];
  hasRejectedProposal?: boolean;
  signals?: Signal[];
}

export interface ImpactAwareness {
  enabled: boolean;
  projects: { projectCode: string; projectName: string; phase: string; signals: Signal[] }[];
}

// H6
export interface CloseoutSummary {
  phase: ProjectPhase;
  checks: GateCheck[];
  documents: { certificateOfCompletion: boolean; asBuiltDrawing: boolean };
  budgets: { category: string; planned: number; committed: number; spent: number }[];
  payroll: { pending: number; approvedSinceCloseout: number };
  closeoutWorkflow: { status: string; currentStageRoleLabel: string | null } | null;
}
