// Thresholds for the decision-support signal layer (apps/api/src/signals/*).
// Every constant here is cited by name in docs/ai-signals-progress.md's
// checklist (S-4) — change them here, not in the rule files, so the numbers
// stay in one place.

export const SIGNAL_THRESHOLDS = {
  costVariance: { warnPct: 0.15, criticalPct: 0.30 },
  cumulativeChange: { warnPct: 0.10, criticalPct: 0.20 },
  burnVsProgress: { warnPoints: 20, criticalPoints: 35 },
  issueRecurrence: { warnCount: 3, criticalCount: 5, windowDays: 30 },
  stalledStage: { warnHours: 48, criticalHours: 120 },
  // Forecast of a proposed change (forecast/change-impact.ts): days the schedule slips.
  changeImpact: { slipWarnDays: 7, slipCriticalDays: 21 },
  // projected-finish rule: pace over the trailing window, and how many days
  // past the last milestone the projected finish may fall before it is raised.
  projectedFinish: { windowDays: 28, warnDays: 7, criticalDays: 21 },
  // overdue-tasks rule: open tasks whose due date has passed.
  overdueTasks: { warnCount: 3, criticalCount: 8 },
  // milestone-slip rule: an active or at-risk milestone past its estimated date.
  milestoneSlip: { warnDays: 1, criticalDays: 14 },
} as const;

// Proposal validation (proposals/validation.ts): how a proposal is compared with
// its surroundings. Every warning it raises names the sample it used.
export const PROPOSAL_CHECKS = {
  // Fewest past proposals of the same project type worth comparing against.
  minSample: 3,
  // Flag an amount this many times the median, or at most this fraction of it.
  highFactor: 2,
  lowFactor: 0.4,
  // Possible duplicate: title similarity at least this, amounts within this share of each other, filed within this many days.
  duplicateTitleSimilarity: 0.7,
  duplicateAmountPct: 0.1,
  duplicateWindowDays: 30,
} as const;

// Dice-coefficient floor below which a cost-catalog match is discarded
// (matcher.ts bestMatch) — see S-3.
export const SIMILARITY_FLOOR = 0.40;

// cache.ts: how long cached reference_snapshots rows are trusted before a
// lazy refresh is attempted.
export const REFERENCE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// reference-client.ts: EstimationPro.ai's documented quota is 100 req/day
// (500 for /index). This is a margin under that so a shared dev environment
// making unrelated calls doesn't tip the account over the real limit.
export const DAILY_REQUEST_BUDGET = 80;
