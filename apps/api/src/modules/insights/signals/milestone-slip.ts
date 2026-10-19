// apps/api/src/signals/milestone-slip.ts (objectives fix 3.5)
//
// An active or at-risk milestone whose estimated date has passed. Draft
// milestones are estimates, not commitments, so they are not judged here.
// Pure; grades and never gates (C3 and K2 in gates.ts own the hard checks).
import type { Signal, SignalContext, SignalRule } from "./types.js";
import type { LifecycleSnapshot } from "../../projects/index.js";
import { SIGNAL_THRESHOLDS } from "../../../core/config/signals.js";
import { daysBetweenIso } from "../../../core/utils/dates.js";

export const milestoneSlipRule: SignalRule = {
  rule: "milestone-slip",
  phases: ["Pre-Construction", "Construction", "Closeout"],
  evaluate(s: LifecycleSnapshot, ctx: SignalContext): Signal[] {
    const today = ctx.now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    const t = SIGNAL_THRESHOLDS.milestoneSlip;
    const signals: Signal[] = [];

    for (const m of s.milestones) {
      if ((m.status !== "active" && m.status !== "at-risk") || !m.estimatedCompletionDate) continue;
      const daysLate = daysBetweenIso(m.estimatedCompletionDate, today);
      if (daysLate < t.warnDays) continue;

      const links = s.milestoneLinks.filter((l) => l.milestoneId === m.id && l.linkType === "task");
      const taskById = new Map(s.tasks.map((task) => [task.id, task]));
      const open = links.filter((l) => taskById.get(l.linkId)?.status !== "Completed").length;

      signals.push({
        key: `milestone-slip:${m.id}`,
        rule: "milestone-slip",
        label: `Milestone "${m.title}" is ${daysLate} day${daysLate === 1 ? "" : "s"} past its date`,
        ownerRoles: ["project-manager", "engineer"],
        severity: daysLate >= t.criticalDays ? "critical" : "warn",
        detail:
          `Estimated ${m.estimatedCompletionDate}, still ${m.status}.` +
          (links.length > 0 ? ` ${open} of ${links.length} linked task(s) are still open.` : " No tasks are linked to it."),
        link: `/projects/${encodeURIComponent(s.project.code)}`,
      });
    }
    return signals;
  },
};
