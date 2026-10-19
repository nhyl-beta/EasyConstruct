// apps/api/src/forecast/change-impact.ts: pure, no I/O (objectives fix 3.2)
//
// Forecasts what approving a change would do to a project: cost against the
// contract, the estimate at completion, and how far the schedule moves. Advice
// only. It never approves, rejects or applies the change; the approver decides.
//
// "How much is done" is task completion, not projects.progress, for the same
// reason signals/burn-vs-progress.ts gives: progress includes the phase-band
// offset (Construction starts at 30%), which would flatter the estimate.
import { SIGNAL_THRESHOLDS } from "../../../core/config/signals.js";
import { addDaysIso } from "../../../core/utils/dates.js";

export type ForecastSeverity = "info" | "warn" | "critical";

export interface ImpactInput {
  /** projects.contractValue; null or 0 when none is on file. */
  contractValue: number | null;
  /** The project's budget lines (planned and actual amounts). */
  budgets: { planned: number; actual: number }[];
  /** Task statuses; completion = Completed / total. */
  tasks: { status: string }[];
  /** Money the change adds (negative for a saving). */
  requestedAmount: number;
  /** Days the change delays the schedule (0 for none; negative if it saves time). */
  timeImpactDays: number;
  milestones: { id: number; title: string; status: string; estimatedCompletionDate: string | null }[];
}

export interface MovedMilestone {
  id: number;
  title: string;
  from: string;
  to: string;
}

export interface ImpactForecast {
  contractValue: number | null;
  currentPlanned: number;
  actualToDate: number;
  requestedAmount: number;
  /** Planned budget after the change. */
  newTotal: number;
  /** (newTotal - contract) / contract * 100; null without a contract value. */
  percentOverContract: number | null;
  /** Task completion, 0-100; null when the project has no tasks. */
  completionPct: number | null;
  /** actual / completion fraction; null until at least one task is done. */
  estimateAtCompletion: number | null;
  /** The estimate at completion plus the requested amount (the change is extra scope). */
  estimateAtCompletionIfApproved: number | null;
  /** Estimate at completion if approved, less the contract (or the planned total); only positive values are an overrun. */
  projectedOverrun: number | null;
  scheduleSlipDays: number;
  movedMilestones: MovedMilestone[];
  severity: ForecastSeverity;
  /** Plain statements of what the numbers rest on. */
  basis: string[];
  sentence: string;
}

const SEVERITY_RANK: Record<ForecastSeverity, number> = { info: 0, warn: 1, critical: 2 };
const maxSeverity = (a: ForecastSeverity, b: ForecastSeverity): ForecastSeverity =>
  SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;

const bySize = (value: number | null, warn: number, critical: number): ForecastSeverity => {
  if (value == null) return "info";
  if (value >= critical) return "critical";
  if (value >= warn) return "warn";
  return "info";
};

const php = (n: number) => `PHP ${Math.round(n).toLocaleString("en-PH")}`;
const round1 = (n: number) => Math.round(n * 10) / 10;

export const forecastChangeImpact = (input: ImpactInput): ImpactForecast => {
  const contract = input.contractValue != null && input.contractValue > 0 ? input.contractValue : null;
  const currentPlanned = input.budgets.reduce((s, b) => s + b.planned, 0);
  const actualToDate = input.budgets.reduce((s, b) => s + b.actual, 0);
  const newTotal = currentPlanned + input.requestedAmount;
  const percentOverContract = contract != null ? round1(((newTotal - contract) / contract) * 100) : null;

  const completedTasks = input.tasks.filter((t) => t.status === "Completed").length;
  const completionPct = input.tasks.length > 0 ? round1((completedTasks / input.tasks.length) * 100) : null;
  const fraction = input.tasks.length > 0 ? completedTasks / input.tasks.length : 0;
  const estimateAtCompletion = fraction > 0 && actualToDate > 0 ? Math.round(actualToDate / fraction) : null;
  const estimateAtCompletionIfApproved =
    estimateAtCompletion != null ? estimateAtCompletion + input.requestedAmount : null;

  const baseline = contract ?? (currentPlanned > 0 ? currentPlanned : null);
  const projectedOverrun =
    estimateAtCompletionIfApproved != null && baseline != null
      ? Math.round(estimateAtCompletionIfApproved - baseline)
      : null;

  const scheduleSlipDays = Math.round(input.timeImpactDays);
  const movedMilestones: MovedMilestone[] =
    scheduleSlipDays === 0
      ? []
      : input.milestones
          .filter((m) => m.status !== "completed" && m.status !== "cancelled" && !!m.estimatedCompletionDate)
          .map((m) => ({
            id: m.id,
            title: m.title,
            from: m.estimatedCompletionDate as string,
            to: addDaysIso(m.estimatedCompletionDate as string, scheduleSlipDays),
          }));

  // Cost: the change's size against the contract uses the cumulative-change
  // thresholds; the projected overrun uses the cost-variance ones. Schedule uses
  // the change-impact slip thresholds (same file, config/signals.ts).
  const costSeverity = bySize(
    percentOverContract != null ? percentOverContract / 100 : null,
    SIGNAL_THRESHOLDS.cumulativeChange.warnPct,
    SIGNAL_THRESHOLDS.cumulativeChange.criticalPct,
  );
  const overrunSeverity = bySize(
    projectedOverrun != null && baseline ? projectedOverrun / baseline : null,
    SIGNAL_THRESHOLDS.costVariance.warnPct,
    SIGNAL_THRESHOLDS.costVariance.criticalPct,
  );
  const slipSeverity = bySize(
    scheduleSlipDays,
    SIGNAL_THRESHOLDS.changeImpact.slipWarnDays,
    SIGNAL_THRESHOLDS.changeImpact.slipCriticalDays,
  );
  const severity = maxSeverity(maxSeverity(costSeverity, overrunSeverity), slipSeverity);

  const basis: string[] = [];
  basis.push(
    contract != null
      ? `Contract value ${php(contract)}; budget planned ${php(currentPlanned)}; requested ${input.requestedAmount >= 0 ? "+" : "-"}${php(Math.abs(input.requestedAmount))}.`
      : `No contract value on file, so the change is not compared with a contract; budget planned ${php(currentPlanned)}.`,
  );
  basis.push(
    estimateAtCompletion != null && completionPct != null
      ? `Estimate at completion = actual cost ${php(actualToDate)} divided by task completion ${completionPct}% (${completedTasks} of ${input.tasks.length} tasks).`
      : "No estimate at completion yet: it needs at least one completed task and some actual cost.",
  );
  basis.push(
    scheduleSlipDays === 0
      ? "No schedule impact stated."
      : `Schedule impact of ${scheduleSlipDays} day${Math.abs(scheduleSlipDays) === 1 ? "" : "s"} moves every open milestone by the same amount.`,
  );

  const parts: string[] = [];
  if (percentOverContract != null) {
    parts.push(`${percentOverContract >= 0 ? "+" : ""}${percentOverContract}% against contract`);
  } else {
    parts.push("no contract value to compare against");
  }
  parts.push(
    estimateAtCompletionIfApproved != null
      ? `estimate at completion ${php(estimateAtCompletionIfApproved)}`
      : "estimate at completion not available yet",
  );
  parts.push(
    scheduleSlipDays === 0
      ? "finish does not move"
      : `finish moves ${scheduleSlipDays > 0 ? "" : "-"}${Math.abs(scheduleSlipDays)} day${Math.abs(scheduleSlipDays) === 1 ? "" : "s"}`,
  );
  const sentence = `If approved: ${parts.join(", ")}.`;

  return {
    contractValue: contract,
    currentPlanned,
    actualToDate,
    requestedAmount: input.requestedAmount,
    newTotal,
    percentOverContract,
    completionPct,
    estimateAtCompletion,
    estimateAtCompletionIfApproved,
    projectedOverrun,
    scheduleSlipDays,
    movedMilestones,
    severity,
    basis,
    sentence,
  };
};

// ── RFI / RFA mapping ────────────────────────────────────────────────────

/**
 * Maps an RFI/RFA impact fields to numbers. `costImpact` and `timeImpact` are
 * the enums none | increase | decrease (design-requests/rules.ts IMPACTS). The
 * request stores no peso amount, only a free-text `costNote` (for example
 * "Subject for variation, about PHP 38,000"), so the amount is read from the
 * note when it names one; otherwise it is 0 and the notes say so. `timeDays`
 * is the day count for a time impact.
 */
export const mapRequestImpact = (req: {
  costImpact: string;
  costNote?: string | null;
  timeImpact: string;
  timeDays?: number | null;
}): { requestedAmount: number; timeImpactDays: number; notes: string[] } => {
  const notes: string[] = [];
  let requestedAmount = 0;
  if (req.costImpact === "increase" || req.costImpact === "decrease") {
    const stated = parseAmount(req.costNote);
    if (stated == null) {
      notes.push(`The request marks a cost ${req.costImpact} but states no amount, so the cost is treated as 0.`);
    } else {
      requestedAmount = req.costImpact === "increase" ? stated : -stated;
    }
  }

  let timeImpactDays = 0;
  if (req.timeImpact === "increase" || req.timeImpact === "decrease") {
    const days = req.timeDays != null && req.timeDays > 0 ? req.timeDays : null;
    if (days == null) {
      notes.push(`The request marks a time ${req.timeImpact} but gives no number of days, so the schedule impact is treated as 0.`);
    } else {
      timeImpactDays = req.timeImpact === "increase" ? days : -days;
    }
  }
  return { requestedAmount, timeImpactDays, notes };
};

/** First peso amount in a note: "PHP 38,000" or a peso sign followed by digits. Suffixes such as "1.5M" are not read. */
export const parseAmount = (note: string | null | undefined): number | null => {
  if (!note) return null;
  const m = note.match(/(?:php|₱)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
