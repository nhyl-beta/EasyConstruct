// apps/api/src/signals/playbook.ts (objectives fix 3.5)
//
// One recommended action per signal rule. These are plain-language suggestions
// for the person who owns the decision; none of them is applied automatically
// and none of them gates anything.
export const PLAYBOOK: Record<string, string> = {
  "cost-variance":
    "Ask the supplier or subcontractor to justify the price, or request a second quote, before the line is approved.",
  "cumulative-change-impact":
    "Review the approved changes together with Finance and the client; consider a formal contract amendment or a scope trade-off before approving more.",
  "burn-vs-progress":
    "Compare spending with the work actually done. Check recent expenses for items not tied to progress, and agree a corrective plan with Finance.",
  "issue-recurrence":
    "Look for a common cause behind the repeated issues, and apply the fix from a similar resolved issue if one is listed.",
  "issue-precedent":
    "A similar issue was resolved before. Read its resolution notes and reuse what worked.",
  "stalled-stage":
    "Contact the person who owns the waiting approval stage, or ask Admin to reassign it, so the workflow moves again.",
  "projected-finish":
    "Check the remaining tasks against the crew available. Add workers or re-sequence the work, or talk to the client about moving the last milestone.",
  "overdue-tasks":
    "Review the overdue tasks with the assigned workers. Re-plan the due dates, reassign blocked tasks, or close those already finished.",
  "milestone-slip":
    "Confirm what is blocking the milestone. Re-date it with the client, mark it at-risk if needed, or complete its remaining linked tasks.",
};

export const FALLBACK_ACTION = "Review the details with the people involved and decide the next step.";

/** The playbook action for a rule, falling back to a generic prompt for a rule not listed. */
export const actionFor = (rule: string, key?: string): string => {
  if (key?.startsWith("issue-precedent:")) return PLAYBOOK["issue-precedent"]!;
  return PLAYBOOK[rule] ?? FALLBACK_ACTION;
};
