// apps/api/src/lifecycle/delivery.ts
//
// Pure rules for the project DELIVERY type, kept apart from the building
// `projectType` (Commercial, Residential…). A Construction project follows the
// full path through site works (phases.ts / gates.ts, unchanged). A Design
// project only delivers plan sets:
//
//   Proposal -> Design -> Turnover (stored as "Closeout") -> Completed -> Archived
//
// No database here, so every rule is unit-tested (delivery.test.ts).
import { NEXT_PHASE, type SequencedPhase } from "./phases.js";

export const DELIVERY_TYPES = ["Construction", "Design"] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export const normalizeDeliveryType = (raw: string | null | undefined): DeliveryType =>
  raw === "Design" ? "Design" : "Construction";

export const DESIGN_TURNOVER_TEMPLATE_NAME = "Design Turnover";

export const DELIVERABLE_DISCIPLINES = ["Architectural", "Structural", "MEP", "Civil", "Interior"] as const;
export type DeliverableDiscipline = (typeof DELIVERABLE_DISCIPLINES)[number];

export const DELIVERABLE_STATUSES = ["not_started", "in_progress", "for_review", "approved", "issued"] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

/** Progress points each plan-set status contributes. */
export const STATUS_POINTS: Record<DeliverableStatus, number> = {
  not_started: 0,
  in_progress: 40,
  for_review: 70,
  approved: 90,
  issued: 100,
};

// ── Phase path ─────────────────────────────────────────────────────────────

/** Next phase for a Design project; null where Advance does not apply. */
const DESIGN_NEXT: Partial<Record<SequencedPhase, SequencedPhase | null>> = {
  Proposal: "Design",
  Design: "Closeout",
  Closeout: "Completed",
  Completed: "Archived",
  Archived: null,
};

export const nextPhaseFor = (deliveryType: string | null | undefined, phase: SequencedPhase): SequencedPhase | null =>
  normalizeDeliveryType(deliveryType) === "Design" ? (DESIGN_NEXT[phase] ?? null) : NEXT_PHASE[phase];

/** Phases a Design project passes through, in order (Pre-Construction and Construction do not apply). */
export const DESIGN_PHASES: readonly SequencedPhase[] = ["Proposal", "Design", "Closeout", "Completed", "Archived"];

/** What the phase is called on screen: a Design project's Closeout reads "Turnover". */
export const phaseLabel = (deliveryType: string | null | undefined, phase: string): string =>
  normalizeDeliveryType(deliveryType) === "Design" && phase === "Closeout" ? "Turnover" : phase;

// ── Progress ───────────────────────────────────────────────────────────────

/** Progress bands for a Design project: Proposal 0-10, Design 10-90, Turnover 90-99. */
export const DESIGN_BANDS = {
  Proposal: { start: 0, end: 10 },
  Design: { start: 10, end: 90 },
  Closeout: { start: 90, end: 99 },
} as const;

/** Average status points (0-100) over the plan sets; 0 when there are none. */
export const planSetAverage = (deliverables: { status: string }[]): number => {
  if (deliverables.length === 0) return 0;
  const total = deliverables.reduce((sum, d) => sum + (STATUS_POINTS[d.status as DeliverableStatus] ?? 0), 0);
  return total / deliverables.length;
};

/**
 * Progress of a Design project in a given phase.
 * Design: the plan-set average scaled into 10-90. Proposal / Turnover scale by
 * the share of their gate checks that pass. Completed / Archived are 100.
 */
export const designProgress = (
  phase: string,
  deliverables: { status: string }[],
  gates: { passed: boolean }[],
): number | null => {
  if (phase === "Completed" || phase === "Archived") return 100;
  if (phase === "Design") {
    const { start, end } = DESIGN_BANDS.Design;
    return Math.round(start + (end - start) * (planSetAverage(deliverables) / 100));
  }
  if (phase === "Proposal" || phase === "Closeout") {
    const { start, end } = DESIGN_BANDS[phase];
    if (gates.length === 0) return start;
    return Math.round(start + (end - start) * (gates.filter((g) => g.passed).length / gates.length));
  }
  return null; // not a Design-path phase: caller keeps the stored value
};

// ── Disciplines ────────────────────────────────────────────────────────────

const GROUP_OF: [DeliverableDiscipline, RegExp][] = [
  ["Architectural", /^(arch|ar$)/i],
  ["Structural", /^(struct|st$)/i],
  ["MEP", /^(mep|mepf|mech|elec|plumb|fire|ee$|me$|pl$)/i],
  ["Civil", /^(civil|site|cv$)/i],
  ["Interior", /^(interior|id$)/i],
];

/** Which plan set a free-text design discipline ("Electrical", "MEPF"…) belongs to. */
export const deliverableForDiscipline = (discipline: string | null | undefined): DeliverableDiscipline | null => {
  const text = (discipline ?? "").trim();
  if (!text) return null;
  return GROUP_OF.find(([, re]) => re.test(text))?.[0] ?? null;
};

/** RFI/RFA discipline codes -> plan set. */
export const REQUEST_CODE_TO_DELIVERABLE: Record<string, DeliverableDiscipline> = {
  AR: "Architectural",
  ST: "Structural",
  EE: "MEP",
  ME: "MEP",
  PL: "MEP",
  CV: "Civil",
  ID: "Interior",
};

export const isDeliverableDiscipline = (v: string): v is DeliverableDiscipline =>
  (DELIVERABLE_DISCIPLINES as readonly string[]).includes(v);

/** Rules for moving a plan set between statuses, by role (the PM and Admin may do any step). */
export const canSetDeliverableStatus = (role: string, from: string, to: string): boolean => {
  if (!(DELIVERABLE_STATUSES as readonly string[]).includes(to) || from === to) return false;
  if (role === "admin" || role === "project-manager") return true;
  if (role === "architect") return to === "not_started" || to === "in_progress" || to === "for_review";
  if (role === "consultant") return to === "approved" || to === "in_progress";
  return false;
};
