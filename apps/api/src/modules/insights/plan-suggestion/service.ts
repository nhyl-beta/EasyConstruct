// apps/api/src/plan-suggestion/service.ts (objectives fix 3.1)
//
// Draft plan on an approved proposal. Read-only advice until a person accepts
// an item; acceptance goes through the normal milestone and task services so
// every existing rule (draft milestones under C3, due dates inside a
// milestone, write locks) still applies. Nothing is applied automatically.
import { ConflictError, NotFoundError, ValidationError } from "../../../core/utils/errors.js";
import { FEATURES } from "../../../core/config/features.js";
import { todayManila, addDaysIso } from "../../../core/utils/dates.js";
import * as repo from "./repository.js";
import {
  buildPlan,
  itemsToAddOnRegenerate,
  milestoneInputFor,
  taskInputFor,
  suggestionStatus,
  taskCodeFor,
  type MilestonePayload,
  type PlanItemDraft,
  type TaskPayload,
} from "./plan.js";
import { proposalRepository } from "../../design/index.js";
import { projectsRepo } from "../../projects/index.js";
import { projectMemberRepo } from "../../projects/index.js";
import { milestonesService } from "../../projects/index.js";
import { tasksService } from "../../projects/index.js";
import { tasksRepo } from "../../projects/index.js";
import { notificationsService } from "../../platform/index.js";
import * as decisionSupport from "../decision-support/service.js";
import { ALLOCATION_CONFIG, allocateTasks, type RankedCandidate } from "../../projects/index.js";

export interface Actor {
  id: number;
  name: string;
  role: string;
}

const toDraftRows = (items: PlanItemDraft[]) =>
  items.map((i) => ({ kind: i.kind, payload: i.payload as unknown as Record<string, unknown> }));

const manilaDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

/**
 * Generates the draft plan once per proposal. Safe to call again: an existing
 * suggestion is returned untouched. Does nothing when decision support is off.
 */
export const generateForProposal = async (proposalId: number) => {
  if (!FEATURES.ai) return null;
  const existing = await repo.findByProposal(proposalId);
  if (existing) return existing;

  const proposal = await proposalRepository.findById(proposalId);
  if (!proposal) throw new NotFoundError("Proposal", String(proposalId));
  const project = await projectsRepo.findByCode(proposal.projectCode);
  if (!project) return null;

  const draft = buildPlan({
    projectType: project.projectType,
    deliveryType: project.deliveryType,
    noticeToProceedDate: await repo.findNoticeToProceedDate(project.code),
    approvalDate: todayManila(),
  });

  const suggestion = await repo.createSuggestion({ projectCode: project.code, proposalId, basis: draft.basis });
  // Lost the race to a concurrent trigger: the other call made the suggestion.
  if (!suggestion) return repo.findByProposal(proposalId);
  await repo.addItems(suggestion.id, toDraftRows(draft.items));

  await notificationsService.notifyProject(project.code, ["project-manager"], {
    title: "Suggested plan ready",
    body: `A draft plan is ready for ${project.code} after "${proposal.title}" was approved. Review and accept the items you want.`,
    link: `/projects/${encodeURIComponent(project.code)}`,
  });
  return suggestion;
};

type ItemRow = Awaited<ReturnType<typeof repo.findItems>>[number];

const itemView = (row: ItemRow, suggested: Map<number, RankedCandidate[]>) => ({
  id: row.id,
  kind: row.kind,
  state: row.state,
  payload: row.payload,
  createdRef: row.createdRef,
  decidedBy: row.decidedBy,
  decidedAt: row.decidedAt,
  suggestedAssignees: row.kind === "task" && row.state === "pending" ? (suggested.get(row.id) ?? []) : [],
});

export const listForProject = async (projectCode: string) => {
  const suggestions = await repo.findByProject(projectCode);
  if (suggestions.length === 0) return [];
  const items = await repo.findItems(suggestions.map((s) => s.id));

  // Assignee suggestions come from the same rules as fix 2.1, computed fresh
  // so staffing done after the plan was drafted is reflected.
  const pendingTasks = items.filter((i) => i.kind === "task" && i.state === "pending");
  const suggested = new Map<number, RankedCandidate[]>();
  if (pendingTasks.length > 0) {
    const today = todayManila();
    const { candidates } = await tasksRepo.loadAllocationData(
      projectCode,
      today,
      addDaysIso(today, -(ALLOCATION_CONFIG.attendanceWindowDays - 1)),
    );
    const result = allocateTasks(
      candidates,
      pendingTasks.map((t) => {
        const p = t.payload as unknown as TaskPayload;
        return { id: t.id, title: String(p.title ?? ""), dueDate: p.dueDate ?? null };
      }),
    );
    for (const r of result) suggested.set(r.taskId, r.suggestions);
  }

  return suggestions.map((s) => {
    const mine = items.filter((i) => i.suggestionId === s.id).map((i) => itemView(i, suggested));
    return {
      id: s.id,
      projectCode: s.projectCode,
      proposalId: s.proposalId,
      status: s.status,
      basis: s.basis,
      createdAt: s.createdAt,
      counts: {
        pending: mine.filter((i) => i.state === "pending").length,
        accepted: mine.filter((i) => i.state === "accepted").length,
        discarded: mine.filter((i) => i.state === "discarded").length,
      },
      items: mine,
    };
  });
};

const refreshStatus = async (suggestionId: number) => {
  const rows = await repo.findItems([suggestionId]);
  await repo.updateSuggestion(suggestionId, { status: suggestionStatus(rows.map((r) => r.state)) });
};

const loadPendingItem = async (suggestionId: number, itemId: number) => {
  const suggestion = await repo.findById(suggestionId);
  if (!suggestion) throw new NotFoundError("Plan suggestion", String(suggestionId));
  const item = await repo.findItem(itemId);
  if (!item || item.suggestionId !== suggestionId) throw new NotFoundError("Plan item", String(itemId));
  if (item.state !== "pending") throw new ConflictError(`This item was already ${item.state}`);
  return { suggestion, item };
};

export const accept = async (
  suggestionId: number,
  itemId: number,
  actor: Actor,
  options: { assignedToUserId?: number } = {},
) => {
  const { suggestion, item } = await loadPendingItem(suggestionId, itemId);
  let createdRef: string | null = null;

  if (item.kind === "milestone") {
    const p = item.payload as unknown as MilestonePayload;
    // Always a draft: the PM still activates it later (lifecycle rule C3).
    const created = await milestonesService.create(milestoneInputFor(p, suggestion.projectCode), actor.name);
    createdRef = `milestone:${created.id}`;
  } else if (item.kind === "task") {
    const p = item.payload as unknown as TaskPayload;
    const siblings = await repo.findItems([suggestionId]);
    const milestoneItem = siblings.find(
      (s) =>
        s.kind === "milestone" &&
        s.state === "accepted" &&
        (s.payload as unknown as MilestonePayload).key === p.milestoneKey,
    );
    if (!milestoneItem?.createdRef) {
      throw new ValidationError(`Accept the milestone for "${p.title}" first, so the task can be linked to it`);
    }
    const milestoneId = Number(milestoneItem.createdRef.split(":")[1]);

    let assignee: { userId: number; name: string } | null = null;
    if (options.assignedToUserId != null) {
      const [member] = await projectMemberRepo.findAll({
        projectCode: suggestion.projectCode,
        userId: options.assignedToUserId,
        role: "site-personnel",
      });
      if (!member) throw new ValidationError("That person is not Site Personnel staffed on this project");
      assignee = { userId: member.userId, name: member.userName };
    }

    const created = await tasksService.create(
      taskInputFor(p, suggestion.projectCode, milestoneId, taskCodeFor(Date.now(), itemId), assignee),
    );
    createdRef = `task:${created.id}`;
  }
  // Responsibilities are a checklist: accepting records it, and creates no
  // record or permission.

  const decided = await repo.decideItem(itemId, { state: "accepted", createdRef, decidedBy: actor.name });
  if (!decided) throw new ConflictError("This item was already decided");
  await refreshStatus(suggestionId);
  await decisionSupport.recordQuietly(actor.id, [
    { kind: "plan-item", itemKey: `${suggestionId}:${itemId}`, projectCode: suggestion.projectCode, action: "accepted" },
  ]);
  return decided;
};

export const discard = async (suggestionId: number, itemId: number, actor: Actor) => {
  const { suggestion } = await loadPendingItem(suggestionId, itemId);
  const decided = await repo.decideItem(itemId, { state: "discarded", decidedBy: actor.name });
  if (!decided) throw new ConflictError("This item was already decided");
  await refreshStatus(suggestionId);
  await decisionSupport.recordQuietly(actor.id, [
    { kind: "plan-item", itemKey: `${suggestionId}:${itemId}`, projectCode: suggestion.projectCode, action: "dismissed" },
  ]);
  return decided;
};

/**
 * Rebuilds the pending items from the current project data (for example after a
 * Notice to Proceed is filed). Accepted items are never touched; discarded
 * ones stay as history and may be offered again.
 */
export const regenerate = async (suggestionId: number) => {
  const suggestion = await repo.findById(suggestionId);
  if (!suggestion) throw new NotFoundError("Plan suggestion", String(suggestionId));
  const project = await projectsRepo.findByCode(suggestion.projectCode);
  if (!project) throw new NotFoundError("Project", suggestion.projectCode);

  const existing = await repo.findItems([suggestionId]);
  const acceptedKeys = new Set(
    existing.filter((i) => i.state === "accepted").map((i) => String((i.payload as { key?: string }).key)),
  );
  const draft = buildPlan({
    projectType: project.projectType,
    deliveryType: project.deliveryType,
    noticeToProceedDate: await repo.findNoticeToProceedDate(project.code),
    approvalDate: manilaDate(suggestion.createdAt),
  });

  await repo.deletePendingItems(suggestionId);
  await repo.addItems(suggestionId, toDraftRows(itemsToAddOnRegenerate(draft, acceptedKeys)));
  await repo.updateSuggestion(suggestionId, { basis: draft.basis });
  await refreshStatus(suggestionId);
  return suggestion.projectCode;
};

export const getSuggestion = async (id: number) => {
  const s = await repo.findById(id);
  if (!s) throw new NotFoundError("Plan suggestion", String(id));
  return s;
};
