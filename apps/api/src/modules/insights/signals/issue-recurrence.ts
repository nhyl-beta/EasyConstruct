// apps/api/src/signals/issue-recurrence.ts — NEW (ai-signals D6)
//
// Two related but distinct signals, both keyed by category:
//   - recurrence: this project has reported the same category of issue
//     repeatedly within a 30-day window (warn/critical).
//   - precedent: fewer repeats, but another project has already resolved a
//     similar issue — worth surfacing even at "info" severity, since it's
//     free knowledge (a resolution note), not a warning about anything.
// Never restates K3 (gates.ts) — K3 says "there are N open issues"; this
// says "this SPECIFIC category keeps recurring" or "someone already solved
// this", neither of which K3's count communicates.
import type { Signal, SignalContext, SignalRule } from "./types.js";
import type { LifecycleSnapshot } from "../../projects/index.js";
import { SIGNAL_THRESHOLDS } from "../../../core/config/signals.js";
import { actionFor } from "./playbook.js";
import { rankPrecedents } from "../../projects/index.js";

const OPEN_STATUSES = new Set(["Submitted", "Under Review"]);
const trim = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const issueRecurrenceRule: SignalRule = {
  rule: "issue-recurrence",
  phases: ["Construction", "Closeout"],
  evaluate(s: LifecycleSnapshot, ctx: SignalContext): Signal[] {
    const openCategories = Array.from(
      new Set(s.issues.filter((i) => OPEN_STATUSES.has(i.status)).map((i) => i.category)),
    );
    if (openCategories.length === 0) return [];

    const windowMs = SIGNAL_THRESHOLDS.issueRecurrence.windowDays * 24 * 60 * 60 * 1000;
    const signals: Signal[] = [];

    for (const category of openCategories) {
      const recentCount = s.issues.filter(
        (i) =>
          i.category === category &&
          i.createdAt != null &&
          ctx.now.getTime() - new Date(i.createdAt).getTime() <= windowMs,
      ).length;

      const precedents = s.issuePrecedents.filter((p) => p.category === category).slice(0, 2);
      const precedentText = precedents
        .map((p) => `"${p.title}" resolved ${p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : "previously"}: ${trim(p.resolutionNotes, 160)}`)
        .join(" · ");

      // Similar resolved issues, ranked by text similarity to the newest open issue
      // in this category (issues/precedents.ts). Empty when nothing clears the floor.
      const subject = s.issues
        .filter((i) => i.category === category && OPEN_STATUSES.has(i.status))
        .sort((a, b) => b.id - a.id)[0];
      const ranked = subject ? rankPrecedents(subject, s.issuePrecedents) : [];
      const resolution = (key: string) => ({
        action: actionFor("issue-recurrence", key),
        ...(ranked.length > 0 ? { precedents: ranked } : {}),
      });

      if (recentCount >= SIGNAL_THRESHOLDS.issueRecurrence.warnCount) {
        const severity =
          recentCount >= SIGNAL_THRESHOLDS.issueRecurrence.criticalCount ? "critical" : "warn";
        const ordinal = `${recentCount}${recentCount === 1 ? "st" : recentCount === 2 ? "nd" : recentCount === 3 ? "rd" : "th"}`;
        signals.push({
          key: `issue-recurrence:${category}`,
          rule: "issue-recurrence",
          label: `${ordinal} ${category} issue in ${SIGNAL_THRESHOLDS.issueRecurrence.windowDays} days`,
          ownerRoles: ["engineer", "project-manager"],
          severity,
          detail:
            `${recentCount} ${category} issue(s) reported on this project in the last ${SIGNAL_THRESHOLDS.issueRecurrence.windowDays} days` +
            (precedentText ? `. Precedent(s): ${precedentText}` : "."),
          link: "/issues",
          suggestedResolution: resolution(`issue-recurrence:${category}`),
        });
      } else if (precedents.length > 0) {
        signals.push({
          key: `issue-precedent:${category}`,
          rule: "issue-recurrence",
          label: "A similar issue was resolved before",
          ownerRoles: ["engineer", "project-manager"],
          severity: "info",
          detail: `An open ${category} issue on this project resembles a resolved one elsewhere. Precedent(s): ${precedentText}`,
          link: "/issues",
          suggestedResolution: resolution(`issue-precedent:${category}`),
        });
      }
    }

    return signals;
  },
};
