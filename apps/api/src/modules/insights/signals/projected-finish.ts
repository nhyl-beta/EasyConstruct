// apps/api/src/signals/projected-finish.ts (objectives fix 3.2)
//
// Pace of the last 28 days against the work still open, compared with the last
// milestone date. Pure: reads the snapshot and the clock it is handed. It grades
// and never gates (see signals/types.ts).
import type { Signal, SignalContext, SignalRule } from "./types.js";
import type { LifecycleSnapshot } from "../../projects/index.js";
import { SIGNAL_THRESHOLDS } from "../../../core/config/signals.js";
import { addDaysIso, daysBetweenIso } from "../../../core/utils/dates.js";

const DAY_MS = 86_400_000;

export interface FinishProjection {
  completedInWindow: number;
  remaining: number;
  /** Tasks completed per day over the window. */
  velocityPerDay: number;
  /** null when nothing was completed in the window, so no pace can be projected. */
  projectedFinish: string | null;
  lastMilestoneDate: string | null;
  /** Days the projected finish falls after the last milestone date (negative = ahead); null without both dates. */
  slipDays: number | null;
}

export const projectFinish = (
  tasks: { status: string; completedAt: Date | string | null }[],
  milestones: { status: string; estimatedCompletionDate: string | null }[],
  today: string,
  now: Date,
  windowDays: number = SIGNAL_THRESHOLDS.projectedFinish.windowDays,
): FinishProjection => {
  const since = now.getTime() - windowDays * DAY_MS;
  const completedInWindow = tasks.filter(
    (t) => t.status === "Completed" && t.completedAt != null && new Date(t.completedAt).getTime() >= since,
  ).length;
  const remaining = tasks.filter((t) => t.status !== "Completed").length;
  const velocityPerDay = completedInWindow / windowDays;
  const projectedFinish =
    velocityPerDay > 0 ? addDaysIso(today, Math.ceil(remaining / velocityPerDay)) : null;

  const dates = milestones
    .filter((m) => m.status !== "cancelled" && !!m.estimatedCompletionDate)
    .map((m) => m.estimatedCompletionDate as string)
    .sort();
  const lastMilestoneDate = dates.length > 0 ? dates[dates.length - 1]! : null;
  const slipDays =
    projectedFinish != null && lastMilestoneDate != null ? daysBetweenIso(lastMilestoneDate, projectedFinish) : null;

  return { completedInWindow, remaining, velocityPerDay, projectedFinish, lastMilestoneDate, slipDays };
};

export const projectedFinishRule: SignalRule = {
  rule: "projected-finish",
  phases: ["Construction"],
  evaluate(s: LifecycleSnapshot, ctx: SignalContext): Signal | null {
    const t = SIGNAL_THRESHOLDS.projectedFinish;
    const today = ctx.now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    const p = projectFinish(s.tasks, s.milestones, today, ctx.now);
    if (p.remaining === 0 || p.lastMilestoneDate == null) return null;
    // A crew that has only just started has no pace to judge yet: wait until the
    // oldest task is older than the window.
    const windowStart = ctx.now.getTime() - t.windowDays * DAY_MS;
    if (!s.tasks.some((task) => task.createdAt != null && new Date(task.createdAt).getTime() < windowStart)) return null;

    if (p.projectedFinish == null) {
      // Work remains but none was finished in the window: no pace to project from.
      return {
        key: `projected-finish:${s.project.code}`,
        rule: "projected-finish",
        label: `No tasks completed in the last ${t.windowDays} days; ${p.remaining} still open`,
        ownerRoles: ["project-manager"],
        severity: "warn",
        detail: `${p.remaining} task(s) remain and none was completed in the last ${t.windowDays} days, so a finish date cannot be projected. The last milestone is due ${p.lastMilestoneDate}.`,
        link: "/tasks",
      };
    }

    if (p.slipDays == null || p.slipDays < t.warnDays) return null;
    const severity = p.slipDays >= t.criticalDays ? "critical" : "warn";
    return {
      key: `projected-finish:${s.project.code}`,
      rule: "projected-finish",
      label: `Projected finish ${p.projectedFinish} is ${p.slipDays} days after the last milestone (${p.lastMilestoneDate})`,
      ownerRoles: ["project-manager"],
      severity,
      detail:
        `${p.completedInWindow} task(s) completed in the last ${t.windowDays} days (${(p.velocityPerDay * 7).toFixed(1)} per week) ` +
        `against ${p.remaining} still open projects a finish on ${p.projectedFinish}.`,
      link: "/tasks",
    };
  },
};
