// apps/api/src/plan-suggestion/plan.ts: pure, no I/O (objectives fix 3.1)
//
// Turns a project type and a start date into a draft plan: dated milestones,
// tasks tied to them, and a responsibilities checklist. Every item states the
// basis it was built from. Nothing here writes anything; the Project Manager
// accepts or discards each item.
import { PLAN_TEMPLATES, RESPONSIBILITIES, type PlanTemplate } from "./templates.js";
import { addDaysIso } from "../utils/dates.js";

export type PlanItemKind = "milestone" | "task" | "responsibility";

export interface MilestonePayload {
  key: string;
  title: string;
  description: string;
  startDate: string;
  estimatedCompletionDate: string;
  durationDays: number;
  basis: string;
}

export interface TaskPayload {
  key: string;
  milestoneKey: string;
  title: string;
  priority: "Low" | "Medium" | "High";
  dueDate: string;
  basis: string;
}

export interface ResponsibilityPayload {
  key: string;
  phase: string;
  role: string;
  roleLabel: string;
  duty: string;
  basis: string;
}

export type PlanItemDraft =
  | { kind: "milestone"; key: string; payload: MilestonePayload }
  | { kind: "task"; key: string; payload: TaskPayload }
  | { kind: "responsibility"; key: string; payload: ResponsibilityPayload };

export interface PlanDraft {
  template: string;
  basis: string;
  startDate: string;
  startSource: "notice-to-proceed" | "approval-date";
  items: PlanItemDraft[];
}

/** Picks the template for a project. Design-only engagements use the Design template; unknown or missing types use General. */
export const selectTemplate = (projectType: string | null | undefined, deliveryType?: string | null): PlanTemplate => {
  if (deliveryType === "Design") return PLAN_TEMPLATES.Design!;
  if (projectType && PLAN_TEMPLATES[projectType] && projectType !== "Design" && projectType !== "General") {
    return PLAN_TEMPLATES[projectType]!;
  }
  return PLAN_TEMPLATES.General!;
};

export const buildPlan = (input: {
  projectType: string | null | undefined;
  deliveryType?: string | null;
  /** Notice to Proceed date (YYYY-MM-DD) if one is on file. */
  noticeToProceedDate?: string | null;
  /** The date the proposal's approval completed (YYYY-MM-DD). */
  approvalDate: string;
}): PlanDraft => {
  const template = selectTemplate(input.projectType, input.deliveryType);
  const startSource = input.noticeToProceedDate ? "notice-to-proceed" : "approval-date";
  const startDate = (input.noticeToProceedDate ?? input.approvalDate).slice(0, 10);
  const startWords = startSource === "notice-to-proceed" ? `the Notice to Proceed date (${startDate})` : `the proposal approval date (${startDate})`;
  const basis =
    `${template.label} template; ${template.durationSource}. ` +
    `Dates run one milestone after another starting from ${startWords}.`;

  const items: PlanItemDraft[] = [];
  let cursor = startDate;
  for (const m of template.milestones) {
    const end = addDaysIso(cursor, m.durationDays);
    const milestoneBasis = `${template.label} template: ${m.durationDays} days typical, ${cursor} to ${end}.`;
    items.push({
      kind: "milestone",
      key: m.key,
      payload: {
        key: m.key,
        title: m.title,
        description: m.description,
        startDate: cursor,
        estimatedCompletionDate: end,
        durationDays: m.durationDays,
        basis: milestoneBasis,
      },
    });
    const n = m.tasks.length;
    m.tasks.forEach((t, i) => {
      // Spread tasks evenly over the milestone; the last one lands on its date,
      // so a task is never due after its milestone.
      const offset = Math.max(1, Math.round((m.durationDays * (i + 1)) / n));
      const dueDate = addDaysIso(cursor, offset);
      items.push({
        kind: "task",
        key: `${m.key}.t${i + 1}`,
        payload: {
          key: `${m.key}.t${i + 1}`,
          milestoneKey: m.key,
          title: t.title,
          priority: t.priority,
          dueDate,
          basis: `Task ${i + 1} of ${n} in "${m.title}", spaced evenly across the milestone.`,
        },
      });
    });
    cursor = end;
  }

  for (const r of RESPONSIBILITIES) {
    const key = `resp.${r.phase}.${r.role}`;
    items.push({
      kind: "responsibility",
      key,
      payload: {
        key,
        phase: r.phase,
        role: r.role,
        roleLabel: r.roleLabel,
        duty: r.duty,
        basis: "Standard duty for this role in this phase (constant table, not specific to this project).",
      },
    });
  }

  return { template: template.key, basis, startDate, startSource, items };
};

/**
 * Items to add on regenerate: every drafted item whose key has not already
 * been accepted. Accepted items are never touched; discarded ones are offered
 * again (the earlier discarded row stays as history).
 */
export const itemsToAddOnRegenerate = (draft: PlanDraft, acceptedKeys: ReadonlySet<string>): PlanItemDraft[] =>
  draft.items.filter((i) => !acceptedKeys.has(i.key));

/** A suggestion is complete when nothing is left pending. */
export const suggestionStatus = (states: readonly string[]): "open" | "complete" =>
  states.some((s) => s === "pending") ? "open" : "complete";

/** Unique task code for an accepted task. */
export const taskCodeFor = (now: number, salt: number): string =>
  `TSK-${String(now).slice(-6)}${String(salt % 100).padStart(2, "0")}`;

/** What accepting a milestone item creates. Always a draft; the PM activates it later. */
export const milestoneInputFor = (p: MilestonePayload, projectCode: string) => ({
  projectCode,
  title: p.title,
  description: `${p.description} (Suggested plan: ${p.basis})`,
  estimatedCompletionDate: p.estimatedCompletionDate,
});

/** What accepting a task item creates: linked to its accepted milestone, assigned only if a person chose one. */
export const taskInputFor = (
  p: TaskPayload,
  projectCode: string,
  milestoneId: number,
  taskCode: string,
  assignee?: { userId: number; name: string } | null,
) => ({
  taskCode,
  projectCode,
  title: p.title,
  description: `Suggested plan: ${p.basis}`,
  priority: p.priority,
  status: "Pending",
  dueDate: p.dueDate,
  milestoneId,
  ...(assignee ? { assignedToUserId: assignee.userId, assignedToName: assignee.name } : {}),
});
