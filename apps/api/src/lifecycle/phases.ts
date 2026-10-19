// apps/api/src/lifecycle/phases.ts — NEW
//
// Single source of truth for the project lifecycle's phases, their progress
// bands, their status tone, and which phase follows which. Every other
// lifecycle file (gates.ts, service.ts, routes.ts) and the client mirror
// (apps/web/src/features/lifecycle/types) reads from here rather than
// hardcoding phase names — see docs/lifecycle-progress.md section D-1.

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

/** Phases with their own progress band and gate checks — the "normal" path. */
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

export const isSequencedPhase = (phase: string): phase is SequencedPhase =>
  (SEQUENCED_PHASES as readonly string[]).includes(phase);

/** What Advance moves a project to next. Completed→Archived is the only
 * Advance step gated to Admin (see lifecycle/service.ts); Archived has no
 * next phase at all. */
export const NEXT_PHASE: Record<SequencedPhase, SequencedPhase | null> = {
  Proposal: "Design",
  Design: "Pre-Construction",
  "Pre-Construction": "Construction",
  Construction: "Closeout",
  Closeout: "Completed",
  Completed: "Archived",
  Archived: null,
};

export interface PhaseBand {
  start: number;
  end: number;
}

/** Construction's band is informational only — computeProgress() derives its
 * number from completed/total tasks, not from gate checks like every other
 * phase (see D-2). Completed/Archived are always 100; On Hold/Cancelled are
 * frozen at whatever the project's progress was when it left the sequence. */
export const PHASE_BANDS: Record<SequencedPhase, PhaseBand> = {
  Proposal: { start: 0, end: 10 },
  Design: { start: 10, end: 25 },
  "Pre-Construction": { start: 25, end: 30 },
  Construction: { start: 30, end: 95 },
  Closeout: { start: 95, end: 99 },
  Completed: { start: 100, end: 100 },
  Archived: { start: 100, end: 100 },
};

export type StatusTone = "success" | "warning" | "destructive" | "neutral";

/** Keys must match apps/web/src/features/projects/constants/project-status.ts
 * STATUS_TONE_CLASS. */
export const PHASE_TONE: Record<ProjectPhase, StatusTone> = {
  Proposal: "neutral",
  Design: "neutral",
  "Pre-Construction": "neutral",
  Construction: "neutral",
  Closeout: "neutral",
  Completed: "success",
  Archived: "success",
  "On Hold": "warning",
  Cancelled: "destructive",
};

/** Phases where lifecycle/service.assertProjectWritable blocks ordinary
 * project-scoped writes (tasks, milestones, requirements, budgets, …). The
 * lifecycle endpoints themselves (advance/hold/resume/cancel/archive) are
 * exempt — see lifecycle/service.ts. */
export const WRITE_LOCKED_PHASES: ReadonlySet<string> = new Set([
  "Archived",
  "Cancelled",
  "On Hold",
]);

/** Phases Hold may be called from (D-1: "Allowed from Design,
 * Pre-Construction or Construction"). */
export const HOLDABLE_PHASES: ReadonlySet<string> = new Set([
  "Design",
  "Pre-Construction",
  "Construction",
]);
