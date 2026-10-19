// apps/api/src/signals/overdue-tasks.ts (objectives fix 3.5)
//
// Open tasks whose due date has passed. Pure; grades and never gates. K1 in
// gates.ts says "N tasks still open" at the end of Construction; this says
// "these are already late" while there is still time to act.
import type { Signal, SignalContext, SignalRule } from "./types.js";
import type { LifecycleSnapshot } from "../lifecycle/repository.js";
import { SIGNAL_THRESHOLDS } from "../core/config/signals.js";
import { daysBetweenIso } from "../core/utils/dates.js";

export const overdueTasksRule: SignalRule = {
  rule: "overdue-tasks",
  phases: ["Construction", "Closeout"],
  evaluate(s: LifecycleSnapshot, ctx: SignalContext): Signal | null {
    const today = ctx.now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    const overdue = s.tasks
      .filter((t) => t.status !== "Completed" && !!t.dueDate && t.dueDate < today)
      .map((t) => ({ title: t.title, daysLate: daysBetweenIso(t.dueDate as string, today) }))
      .sort((a, b) => b.daysLate - a.daysLate);
    const t = SIGNAL_THRESHOLDS.overdueTasks;
    if (overdue.length < t.warnCount) return null;

    const severity = overdue.length >= t.criticalCount ? "critical" : "warn";
    const worst = overdue
      .slice(0, 3)
      .map((o) => `"${o.title}" (${o.daysLate} day${o.daysLate === 1 ? "" : "s"} late)`)
      .join(", ");
    return {
      key: `overdue-tasks:${s.project.code}`,
      rule: "overdue-tasks",
      label: `${overdue.length} tasks are past their due date`,
      ownerRoles: ["project-manager", "engineer"],
      severity,
      detail: `${overdue.length} open task(s) are overdue; the latest are ${worst}.`,
      link: "/tasks",
    };
  },
};
