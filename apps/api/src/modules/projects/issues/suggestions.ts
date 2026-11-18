// Rule-based decision support for one open issue. Pure (no I/O), like precedents.ts.
// Every suggestion carries the rule that produced it, so a person can judge it. It never
// changes the issue's status and never fills anything in by itself.

export interface SuggestionContext {
  /** Other open issues in the same project and category. */
  sameCategoryOpen: number;
  /** Open tasks on the project past their due date. */
  overdueTasks: number;
  /** Active or at-risk milestones past their estimated date. */
  slippingMilestones: number;
}

export interface Suggestion {
  text: string;
  /** The rule behind it, shown next to the text. */
  basis: string;
}

export interface IssueSuggestions {
  firstSteps: Suggestion[];
  urgency: Suggestion;
  context: Suggestion[];
}

/** Other open issues of one category before it counts as a pattern. */
export const RECURRENCE_MIN = 2;

const PLAYBOOK: Record<string, string[]> = {
  Technical: [
    "Reproduce the problem and note exactly what the drawings or specification say at that point.",
    "Ask the Architect or Consultant for a clarification (RFI) if the documents disagree or are silent.",
  ],
  Structural: [
    "Stop work on the affected element and have the Engineer inspect it against the structural drawings.",
    "Photograph and measure the defect, and get the Consultant's written direction before anything is repaired or covered.",
  ],
  Material: [
    "Check the delivery note and the approved specification, and photograph the material or defect.",
    "Quarantine the affected batch, then ask the supplier for a replacement or credit.",
  ],
  Schedule: [
    "List the tasks that are waiting because of this and the date each one is now at risk.",
    "Re-sequence work that is not blocked, and tell the Project Manager if a milestone date will move.",
  ],
  Resource: [
    "Confirm what is missing (crew, equipment or access) and for which dates.",
    "Ask the Project Manager to reassign or add the resource, or move the work to a day it is available.",
  ],
  Quality: [
    "Compare the work against the approved specification and mark the defective area.",
    "Agree the rework or acceptance with the Consultant, and re-inspect before the next trade covers it.",
  ],
  Safety: [
    "Make the area safe first: barricade it and keep people out until it is checked.",
    "Record what happened, notify the Project Manager, and do not resume the work until a qualified person clears it.",
  ],
  Other: ["Review the details with the people involved and decide the next step."],
};

const URGENCY: Record<string, string> = {
  Critical: "Respond today and tell the Project Manager now. Consider pausing work in the affected area until it is understood.",
  High: "Respond within 2 working days and keep the Project Manager informed.",
  Medium: "Respond within a week.",
  Low: "Handle it in the normal review cycle.",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const suggestResolution = (
  issue: { category: string; severity: string },
  ctx: SuggestionContext,
): IssueSuggestions => {
  const category = issue.category in PLAYBOOK ? issue.category : "Other";
  const urgencyText = URGENCY[issue.severity] ?? URGENCY.Medium!;
  const serious = issue.severity === "Critical" || issue.severity === "High";

  const context: Suggestion[] = [];
  if (ctx.sameCategoryOpen >= RECURRENCE_MIN) {
    context.push({
      text: `${plural(ctx.sameCategoryOpen, "other open issue is", "other open issues are")} also ${category} on this project. Look for a common cause before fixing them one by one.`,
      basis: `Rule: ${RECURRENCE_MIN}+ open issues in the same category`,
    });
  }
  if (ctx.overdueTasks > 0) {
    context.push({
      text: `${plural(ctx.overdueTasks, "task is", "tasks are")} past the due date on this project. If this issue is blocking them, record that and re-plan the dates.`,
      basis: "Rule: overdue tasks on the project",
    });
  }
  if (ctx.slippingMilestones > 0) {
    context.push({
      text: `${plural(ctx.slippingMilestones, "milestone is", "milestones are")} past its estimated date. Check whether this issue is the cause and mark the milestone at risk if so.`,
      basis: "Rule: milestone slip on the project",
    });
  }

  return {
    firstSteps: PLAYBOOK[category]!.map((text) => ({ text, basis: `Playbook: ${category}` })),
    urgency: {
      text: urgencyText,
      basis: `Rule: severity ${issue.severity}${serious && (category === "Safety" || category === "Structural") ? `, category ${category}` : ""}`,
    },
    context,
  };
};
