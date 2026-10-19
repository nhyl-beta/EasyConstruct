import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../core/utils/errors.js";
import { assertProjectWritable, refreshProjectProgress } from "../lifecycle/service.js";
import { CLOSEOUT_TEMPLATE_NAME } from "../lifecycle/repository.js";
import { filterRowsToCodes } from "../projects/visibility.js";
import { DESIGN_TURNOVER_TEMPLATE_NAME, normalizeDeliveryType } from "../lifecycle/delivery.js";
import { proposalRepository } from "../proposals/repository.js";
import * as planSuggestionService from "../plan-suggestion/service.js";
import * as notificationsService from "../notifications/service.js";
import { validateWorkflowLineItems } from "../ai-validation/service.js";
import * as validationRepo from "../ai-validation/repository.js";
import type { LineItemValidationSummary } from "../ai-validation/types.js";
import { FEATURES } from "../core/config/features.js";
import * as budgetService from "../finance/budget/service.js";
import * as budgetAdjustmentsService from "../finance/budget-adjustments/service.js";
import * as projectsRepo from "../projects/repository.js";
import { expensesRepository } from "../finance/expenses/repository.js";
import * as repo from "./repository.js";
import { workflows as workflowsTable } from "../core/db/schema/workflows.js";
import { orderByFor, paginate, paginateRows, byDate, byString, type PageRequest } from "../core/utils/pagination.js";
import type {
  ApprovalQueueItem,
  ApprovalScope,
  CreateWorkflowInput,
  CreateWorkflowTemplateInput,
  DecideStageInput,
  TemplateWithActiveCount,
  UpdateWorkflowInput,
  WorkflowAttachmentInput,
  WorkflowAttachmentRecord,
  WorkflowLineItemRecord,
  WorkflowWithStages,
} from "./types.js";

// ai-signals C5: only these two templates carry cost line items worth
// comparing against a market-rate catalog — every other template's line
// items (if any) are non-monetary or out of scope for this pass.
const COST_COMPARABLE_TEMPLATES = new Set(["Budget Change Request", "Change Order Request"]);

// H3/Q1: the "Project Closeout" preconditions, as a pure function over
// already-fetched data — no database access — so it's unit-testable the same
// way lifecycle/gates.ts's pure LifecycleSnapshot checks are (see
// workflows/closeout-eligibility.test.ts). createWorkflow below is the only
// caller; it does the actual fetching.
export const assertCloseoutWorkflowAllowed = (input: {
  role: string | undefined;
  project: { code: string; status: string };
  hasActiveCloseoutWorkflow: boolean;
}): void => {
  if (input.role !== "engineer" && input.role !== "admin") {
    throw new ForbiddenError('Only Engineer (or Admin) may start a "Project Closeout" workflow');
  }
  if (input.project.status !== "Closeout") {
    throw new ConflictError(
      `Project ${input.project.code} is in "${input.project.status}" — a "Project Closeout" workflow can only be started once it reaches Closeout`,
    );
  }
  // Q1: nothing previously stopped a second "Project Closeout" workflow from
  // being started for the same project — e.g. after the first one stalls or
  // is abandoned, a fresh one could be raised on top of it, leaving two
  // active chains both claiming to be THE closeout for that project.
  if (input.hasActiveCloseoutWorkflow) {
    throw new ConflictError('A "Project Closeout" workflow is already in progress for this project');
  }
};

// Same ownership rule used for project-engineers (EC-017): admin may manage
// any workflow; anyone else only the one they created. IT Designer used to
// be included here — it no longer is, since its workflow scope is read-only
// (see the note on canInitiateWorkflow in routes.ts).
const assertCanManageWorkflow = async (id: number, requesterRole: string, requesterName: string) => {
  if (requesterRole === "admin") return;
  const workflow = await repo.findWorkflowById(id);
  if (!workflow) throw new NotFoundError("Workflow", String(id));
  if (workflow.createdBy !== requesterName) {
    throw new ForbiddenError("You can only edit or delete workflows you created");
  }
};

// ── Templates ──────────────────────────────────────────────────────────────

export const getTemplates = async (): Promise<TemplateWithActiveCount[]> => {
  const [templates, activeCounts] = await Promise.all([
    repo.findAllTemplates(),
    repo.countActiveByTemplate(),
  ]);

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    avgDurationHours: t.avgDurationHours,
    defaultStages: t.defaultStages,
    activeCount: activeCounts.get(t.id) ?? 0,
  }));
};

/**
 * Defines a new, reusable workflow template — the steps/roles/order a
 * workflow can later be started from. This was previously entirely fixed:
 * the templates a workflow could be raised from were whatever had been
 * seeded, with no admin-facing way to add another (see
 * admin-workflow-configuration.tsx, which was read-only for exactly this
 * reason).
 *
 * Deliberately reuses the SAME table (`workflow_templates`) every seeded
 * template already lives in, rather than a parallel "custom templates"
 * table — createWorkflow() and every other consumer of a template id
 * already treat all rows in this table identically, so a hand-defined
 * template is usable everywhere a seeded one is with no extra plumbing.
 */
export const createTemplate = async (
  input: CreateWorkflowTemplateInput,
): Promise<TemplateWithActiveCount> => {
  const created = await repo.insertTemplate({
    name: input.name,
    description: input.description,
    avgDurationHours: input.avgDurationHours.toFixed(1),
    defaultStages: input.defaultStages,
  });
  if (!created) throw new Error("Failed to create workflow template");

  return {
    id: created.id,
    name: created.name,
    description: created.description,
    avgDurationHours: created.avgDurationHours,
    defaultStages: created.defaultStages,
    activeCount: 0,
  };
};

/**
 * Removing a template is blocked while any workflow — active or completed —
 * was ever raised from it: workflows.template_id has no onDelete rule, so the
 * delete would otherwise fail with a raw foreign-key error, and even if it
 * didn't, every workflow raised from that template would lose the template
 * name shown throughout its history (WorkflowStagePipeline, the approval
 * queue, etc.).
 */
export const deleteTemplate = async (id: number) => {
  const template = await repo.findTemplateById(id);
  if (!template) throw new NotFoundError("Workflow template", String(id));

  const existing = await repo.findWorkflowsByTemplate(id);
  if (existing.length > 0) {
    throw new ConflictError(
      `"${template.name}" has ${existing.length} workflow(s) raised from it and cannot be deleted. Those workflows must be deleted first.`,
    );
  }

  const deleted = await repo.deleteTemplate(id);
  if (!deleted) throw new NotFoundError("Workflow template", String(id));
  return deleted;
};

// ── Workflows ──────────────────────────────────────────────────────────────

const attachStages = async (rows: (typeof import("../core/db/schema/workflows.js").workflows.$inferSelect)[]) => {
  const ids = rows.map((r) => r.id);
  // Attachments and line items are fetched with the stages, not on a separate
  // round trip per screen: every approval view needs the full submission
  // trail, so a workflow that arrives without it is what left approvers
  // deciding blind in the first place.
  const [stages, templates, attachmentRows, lineItemRows] = await Promise.all([
    repo.findStagesForWorkflows(ids),
    repo.findAllTemplates(),
    repo.findAttachmentsForWorkflows(ids),
    repo.findLineItemsForWorkflows(ids),
  ]);
  const templateNameById = new Map(templates.map((t) => [t.id, t.name]));

  // ai-signals C7: decision support only — the flag gates whether this even
  // runs, and a validation result can never change what attachStages
  // returns for approval purposes (stages/status/amount are untouched).
  const validationByLineItemId = new Map<number, LineItemValidationSummary>();
  if (FEATURES.ai) {
    const latest = await validationRepo.findLatestByLineItemIds(lineItemRows.map((li) => li.id));
    for (const [lineItemId, row] of latest) {
      validationByLineItemId.set(lineItemId, {
        verdict: row.verdict as LineItemValidationSummary["verdict"],
        variancePct: row.variancePct != null ? Number(row.variancePct) : null,
        referenceLowPhp: row.referenceLowPhp != null ? Number(row.referenceLowPhp) : null,
        referenceMidPhp: row.referenceMidPhp != null ? Number(row.referenceMidPhp) : null,
        referenceHighPhp: row.referenceHighPhp != null ? Number(row.referenceHighPhp) : null,
        basisSummary: row.basisSummary,
        sources: row.sources as LineItemValidationSummary["sources"],
      });
    }
  }

  const stagesByWorkflow = new Map<number, typeof stages>();
  for (const s of stages) {
    const list = stagesByWorkflow.get(s.workflowId) ?? [];
    list.push(s);
    stagesByWorkflow.set(s.workflowId, list);
  }

  const attachmentsByWorkflow = new Map<number, WorkflowAttachmentRecord[]>();
  for (const { attachment, stageLabel } of attachmentRows) {
    const list = attachmentsByWorkflow.get(attachment.workflowId) ?? [];
    list.push({ ...attachment, stageLabel: stageLabel ?? null });
    attachmentsByWorkflow.set(attachment.workflowId, list);
  }

  const lineItemsByWorkflow = new Map<number, WorkflowLineItemRecord[]>();
  for (const item of lineItemRows) {
    const list = lineItemsByWorkflow.get(item.workflowId) ?? [];
    list.push({ ...item, validation: validationByLineItemId.get(item.id) ?? null });
    lineItemsByWorkflow.set(item.workflowId, list);
  }

  return rows.map((w): WorkflowWithStages => ({
    id: w.id,
    code: w.code,
    title: w.title,
    projectCode: w.projectCode,
    templateId: w.templateId,
    templateName: w.templateId ? templateNameById.get(w.templateId) ?? null : null,
    budgetId: w.budgetId,
    amount: w.amount,
    type: w.type,
    severity: w.severity,
    aiNote: w.aiNote,
    status: w.status,
    createdBy: w.createdBy,
    createdByUserId: w.createdByUserId,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    stages: (stagesByWorkflow.get(w.id) ?? []).map((s) => ({
      id: s.id,
      sequence: s.sequence,
      role: s.role,
      roleLabel: s.roleLabel,
      iconKey: s.iconKey,
      status: s.status,
      assignedTo: s.assignedTo,
      decidedBy: s.decidedBy,
      decidedAt: s.decidedAt,
      comments: s.comments,
      createdAt: s.createdAt,
    })),
    attachments: attachmentsByWorkflow.get(w.id) ?? [],
    lineItems: lineItemsByWorkflow.get(w.id) ?? [],
  }));
};

// ai-signals C8: a manual re-check, for when the cached catalog has been
// refreshed since the workflow was raised. Same non-blocking guarantee as
// C5 — never throws, never changes what the workflow's own status/stages
// are, only its aiNote and validation_results rows.
export const revalidateWorkflow = async (id: number): Promise<WorkflowWithStages> => {
  await validateWorkflowLineItems(id).catch((error) =>
    console.error(`[ai-validation] revalidateWorkflow(${id}) threw:`, error),
  );
  return getWorkflowById(id);
};

/** Project code of a workflow, for visibility checks that must not load stages and attachments. */
export const getWorkflowProjectCode = async (id: number): Promise<string> => {
  const row = await repo.findWorkflowById(id);
  if (!row) throw new NotFoundError("Workflow", String(id));
  return row.projectCode;
};

export const getActiveWorkflows = async (): Promise<WorkflowWithStages[]> => {
  const rows = await repo.findWorkflows("active");
  return attachStages(rows);
};

/** One page of active workflows; stages, attachments and line items are loaded for this page's ids only. */
export const getActiveWorkflowsPage = async (
  filters: Omit<repo.WorkflowListFilters, "status">,
  request: PageRequest,
) => {
  const scoped = { ...filters, status: "active" };
  const { items: rows, meta } = await paginate(
    request,
    () => repo.countWorkflows(scoped),
    (window) =>
      repo.findWorkflowsPage(
        scoped,
        window,
        orderByFor(request, repo.WORKFLOW_SORT_COLUMNS, repo.defaultWorkflowOrder, workflowsTable.id),
      ),
  );
  return { items: await attachStages(rows), meta };
};

export const getWorkflowById = async (id: number): Promise<WorkflowWithStages> => {
  const row = await repo.findWorkflowById(id);
  if (!row) throw new NotFoundError("Workflow", String(id));
  const attached = await attachStages([row]);
  const withStages = attached[0];
  if (!withStages) throw new NotFoundError("Workflow", String(id));
  return withStages;
};

export const updateWorkflow = async (
  id: number,
  input: UpdateWorkflowInput,
  requesterRole: string,
  requesterName: string,
): Promise<WorkflowWithStages> => {
  await assertCanManageWorkflow(id, requesterRole, requesterName);
  const updated = await repo.updateWorkflow(id, input);
  if (!updated) throw new NotFoundError("Workflow", String(id));
  return getWorkflowById(id);
};

export const deleteWorkflow = async (
  id: number,
  requesterRole: string,
  requesterName: string,
): Promise<WorkflowWithStages> => {
  await assertCanManageWorkflow(id, requesterRole, requesterName);
  // Fetch the full record (with stages) before the row — and its
  // cascade-deleted stages — disappear, so the caller/audit log still has
  // something to show for what was removed.
  const existing = await getWorkflowById(id);
  const deleted = await repo.deleteWorkflow(id);
  if (!deleted) throw new NotFoundError("Workflow", String(id));
  return existing;
};

export const createWorkflow = async (
  input: CreateWorkflowInput,
  createdBy: string,
  createdByRole?: string,
  createdByUserId?: number,
): Promise<WorkflowWithStages> => {
  const template = await repo.findTemplateById(input.templateId);
  if (!template) throw new ValidationError(`Unknown workflow template ${input.templateId}`);
  await assertProjectWritable(input.projectCode);

  // H3: a Project Closeout workflow only makes sense once the project has
  // actually reached Closeout, and only the Engineer (whose own Final
  // Inspection stage opens it) may start one — mirrors the "auto-approve the
  // initiator's own stage" assumption below, which requires the initiator's
  // role to actually be the template's first stage's role.
  // Delivery type decides which hand-over workflow applies: a Design project
  // closes with Design Turnover (once it is at Turnover), a Construction
  // project with Project Closeout — never the other way round.
  {
    const target = await projectsRepo.findByCode(input.projectCode);
    const isDesignProject = normalizeDeliveryType(target?.deliveryType) === "Design";
    if (template.name === DESIGN_TURNOVER_TEMPLATE_NAME) {
      if (!isDesignProject) throw new ConflictError("Design Turnover applies to Design projects only");
      if (target!.status !== "Closeout") {
        throw new ConflictError(`Design Turnover can start once the project is at Turnover (currently "${target!.status}")`);
      }
    }
    if (template.name === CLOSEOUT_TEMPLATE_NAME && isDesignProject) {
      throw new ConflictError("A Design project is handed over with the Design Turnover workflow, not Project Closeout");
    }
  }

  if (template.name === CLOSEOUT_TEMPLATE_NAME) {
    // assertProjectWritable above already guarantees this project exists.
    const project = await projectsRepo.findByCode(input.projectCode);
    const existingForProject = await repo.findWorkflowsByProjectCode(input.projectCode);
    const hasActiveCloseoutWorkflow = existingForProject.some(
      (w) => w.templateId === template.id && w.status === "active",
    );
    assertCloseoutWorkflowAllowed({
      role: createdByRole,
      project: { code: project!.code, status: project!.status },
      hasActiveCloseoutWorkflow,
    });
  }

  const seq = await repo.nextWorkflowSeq();
  const code = `WF-${1000 + seq}`;

  const workflow = await repo.insertWorkflow({
    code,
    title: input.title,
    projectCode: input.projectCode,
    templateId: template.id,
    amount: input.amount !== undefined ? String(input.amount) : null,
    type: input.type ?? null,
    budgetId: input.budgetId ?? null,
    severity: "medium",
    aiNote: null,
    status: "active",
    createdBy,
    createdByUserId: createdByUserId ?? null,
  });
  if (!workflow) throw new Error("Failed to create workflow");

  const stageRows = template.defaultStages.map((def, index) => ({
    workflowId: workflow.id,
    sequence: index + 1,
    role: def.role,
    roleLabel: def.roleLabel,
    iconKey: def.iconKey,
    status: index === 0 ? "current" : "upcoming",
    assignedTo: input.stageAssignments?.[String(index + 1)] ?? null,
  }));
  const insertedStages = await repo.insertStages(stageRows);

  // Whatever the initiator submitted is filed against stage 1 — their own
  // step — so later approvers can see which point in the chain it came from.
  const firstStage = insertedStages.find((stage) => stage.sequence === 1) ?? null;

  if (input.attachments?.length) {
    await repo.insertAttachments(
      input.attachments.map((a) => toAttachmentRow(a, workflow.id, firstStage?.id ?? null, createdBy)),
    );
  }

  if (input.lineItems?.length) {
    await repo.insertLineItems(
      input.lineItems.map((item) => ({
        workflowId: workflow.id,
        category: item.category,
        description: item.description,
        currentAmount: (item.currentAmount ?? 0).toFixed(2),
        requestedAmount: item.requestedAmount.toFixed(2),
        quantity: item.quantity != null ? item.quantity.toFixed(3) : null,
        unit: item.unit ?? null,
      })),
    );

    // ai-signals C5: decision support only, never a gate — a thrown error
    // here must not stop the workflow that already exists above from being
    // returned to the caller, so this is awaited (bounded by the reference
    // client's own 5s timeout) but never allowed to propagate.
    if (FEATURES.ai && COST_COMPARABLE_TEMPLATES.has(template.name)) {
      await validateWorkflowLineItems(workflow.id).catch((error) =>
        console.error(`[ai-validation] validateWorkflowLineItems(${workflow.id}) threw:`, error),
      );
    }
  }

  // Auto-approve the initiator's own stage. The role that raises a workflow
  // has, by definition, already done what that first stage exists to
  // capture — an Engineer opening a Budget Change Request has already
  // supplied the "Engineer Justification" the first stage asks for, HR
  // opening a Subcontractor onboarding has already done the "HR
  // Verification" that names — so it makes no sense for that same stage to
  // then sit in their own pending queue waiting on them a second time.
  //
  // Only fires when the creator's role actually matches stage 1's role: a
  // PM or Admin starting a workflow on someone else's behalf (e.g. from the
  // general "New workflow" dialog) still leaves that first stage for its
  // real owner to decide, exactly as before.
  if (firstStage && createdByRole && firstStage.role === createdByRole) {
    await repo.updateStage(firstStage.id, {
      status: "done",
      decidedBy: createdBy,
      decidedAt: new Date(),
      comments: "Automatically approved — submitted by the initiating role.",
    });

    const secondStage = insertedStages.find((stage) => stage.sequence === 2);
    if (secondStage) {
      await repo.updateStage(secondStage.id, { status: "current" });
    } else {
      // A single-stage workflow: the initiator's own step was the only one.
      await repo.updateWorkflowStatus(workflow.id, "completed");
    }
  }

  // J2: whichever stage actually ends up "current" after the auto-approve
  // above (stage 1 itself, or stage 2 if stage 1 was auto-approved) gets its
  // owning role notified that something is waiting on them — covers
  // "Proposal submitted", "Budget change submitted", etc. for every
  // template generically, rather than one bespoke notification per domain.
  const openingStage = firstStage && createdByRole && firstStage.role === createdByRole
    ? insertedStages.find((stage) => stage.sequence === 2)
    : firstStage;
  if (openingStage) {
    await notificationsService.notifyProject(input.projectCode, [openingStage.role], {
      title: `${template.name} needs your review`,
      body: `"${input.title}" (${workflow.code}) on ${input.projectCode} is waiting on your ${openingStage.roleLabel} decision.`,
      link: "/workflows",
    });
  }

  // A new active workflow can flip gate K4 (Construction exit: "no active
  // workflows") off, and a single-stage workflow that auto-completed above
  // can flip it back on — either way, progress may have changed.
  await refreshProjectProgress(input.projectCode);

  return getWorkflowById(workflow.id);
};

// ── Attachments ────────────────────────────────────────────────────────────

const toAttachmentRow = (
  input: WorkflowAttachmentInput,
  workflowId: number,
  stageId: number | null,
  uploadedBy: string,
) => ({
  workflowId,
  stageId: input.stageId ?? stageId,
  kind: input.kind ?? (input.fileUrl ? "document" : "note"),
  label: input.label,
  content: input.content ?? null,
  fileUrl: input.fileUrl ?? null,
  fileName: input.fileName ?? null,
  fileSize: input.fileSize ?? null,
  uploadedBy,
});

/**
 * File something against a workflow that is already running — e.g. a
 * consultant attaching an advisory note, or a stage owner adding the document
 * their decision rests on. Defaults to the workflow's current stage so the
 * caller does not have to know the stage id.
 */
export const addAttachment = async (
  workflowId: number,
  input: WorkflowAttachmentInput,
  uploadedBy: string,
): Promise<WorkflowWithStages> => {
  const workflow = await repo.findWorkflowById(workflowId);
  if (!workflow) throw new NotFoundError("Workflow", String(workflowId));

  const stages = await repo.findStagesByWorkflow(workflowId);
  const currentStage = stages.find((stage) => stage.status === "current") ?? null;

  await repo.insertAttachments([
    toAttachmentRow(input, workflowId, currentStage?.id ?? null, uploadedBy),
  ]);

  return getWorkflowById(workflowId);
};

/**
 * Every workflow raised from a named template, with its stages, attachments
 * and line items already attached. Finance's budget-change review is the
 * first caller (template "Budget Change Request"); the lookup is by name
 * rather than a hardcoded id because template ids differ per environment.
 */
export const getWorkflowsByTemplateName = async (
  templateName: string,
): Promise<WorkflowWithStages[]> => {
  const template = await repo.findTemplateByName(templateName);
  if (!template) return [];
  const rows = await repo.findWorkflowsByTemplate(template.id);
  return attachStages(rows);
};

// ── Decisions ──────────────────────────────────────────────────────────────

export const decideStage = async (
  workflowId: number,
  stageId: number,
  input: DecideStageInput,
  requesterRole: string,
): Promise<WorkflowWithStages> => {
  const stage = await repo.findStageById(stageId);
  if (!stage || stage.workflowId !== workflowId) {
    throw new NotFoundError("Workflow stage", String(stageId));
  }
  if (stage.status !== "current") {
    throw new ValidationError(
      `Stage ${stageId} is '${stage.status}' and is not awaiting a decision`,
    );
  }
  const owningWorkflow = await repo.findWorkflowById(workflowId);
  if (owningWorkflow) await assertProjectWritable(owningWorkflow.projectCode);
  // Intentional (EC-003, decided): admin can decide ANY stage regardless of
  // its assigned role. This is a deliberate escalation/override path (e.g. a
  // role-holder is unavailable) — do not remove or restrict this without a
  // product decision to do so. IT Designer is deliberately NOT included:
  // its workflow scope is read-only (routes.ts already blocks it from ever
  // reaching this function; this check would otherwise re-open the same
  // door if the route gate were ever changed independently of this one).
  const isPrivileged = requesterRole === "admin";
  if (!isPrivileged && stage.role !== requesterRole) {
    throw new ForbiddenError(
      `This stage requires a '${stage.role}' decision; you are '${requesterRole}'`,
    );
  }

  // H4: Finance may not sign off a Project Closeout workflow's own stage
  // while the project still has an unresolved (pending) expense — the same
  // spend gate X3 already enforces for payroll, applied to expenses here.
  if (owningWorkflow && stage.role === "finance-manager" && input.decision === "approve") {
    const template = owningWorkflow.templateId ? await repo.findTemplateById(owningWorkflow.templateId) : null;
    if (template?.name === CLOSEOUT_TEMPLATE_NAME) {
      const pending = await expensesRepository.hasPending(owningWorkflow.projectCode);
      if (pending) {
        throw new ConflictError(
          "This project still has a pending expense — resolve it before signing off Closeout",
        );
      }
    }
  }

  const decidedAt = new Date();
  const nextStageStatus =
    input.decision === "approve" ? "done" : input.decision === "reject" ? "rejected" : "revision-required";

  await repo.updateStage(stageId, {
    status: nextStageStatus,
    decidedBy: input.decidedBy,
    decidedAt,
    comments: input.comments ?? null,
  });

  // D3: a proposal linked to this workflow (proposals.workflow_id, set by
  // POST /proposals/submit) has its status kept in sync rather than decided
  // independently — one source of truth instead of two, since the old
  // PATCH /proposals/:id/review wrote the proposal directly with nothing
  // keeping it and its workflow's stages in agreement.
  const syncLinkedProposal = async (status: "Approved" | "Rejected" | "Revision Requested") => {
    const linked = await proposalRepository.findByWorkflowId(workflowId);
    if (linked) await proposalRepository.update(linked.id, { status });
  };

  // Fix 3.1: an approved proposal gets a draft plan for the PM to review. It is
  // advice only and must never fail or roll back the approval, so any error
  // (including a missing table before the migration is applied) is logged and dropped.
  const draftPlanForApprovedProposal = async () => {
    try {
      const linked = await proposalRepository.findByWorkflowId(workflowId);
      if (linked) await planSuggestionService.generateForProposal(linked.id);
    } catch (err) {
      console.error("[plan-suggestion] could not draft a plan", err);
    }
  };

  // G4: a "Budget Change Request" workflow (workflows.budgetId set) that
  // completes its final approval moves the delta into the real budget —
  // budgets.planned, plus a budget_adjustments row recording the change —
  // rather than the change living only in the workflow's line items.
  const syncLinkedBudgetChange = async () => {
    if (!owningWorkflow?.budgetId) return;
    const lineItems = await repo.findLineItemsForWorkflows([workflowId]);
    const delta = lineItems.length
      ? lineItems.reduce((sum, item) => sum + (Number(item.requestedAmount) - Number(item.currentAmount)), 0)
      : Number(owningWorkflow.amount ?? 0);
    if (delta === 0) return;

    const budget = await budgetService.getById(owningWorkflow.budgetId);
    const newPlanned = budget.planned + delta;
    await budgetService.update(budget.id, { planned: newPlanned });
    await budgetAdjustmentsService.create({
      budgetId: budget.id,
      kind: delta >= 0 ? "increase" : "decrease",
      originalAmount: budget.planned,
      adjustmentAmount: delta,
      newAmount: newPlanned,
      reason: `Approved via workflow ${owningWorkflow.code}: ${owningWorkflow.title}`,
      requestedBy: owningWorkflow.createdBy,
      status: "approved",
    });
  };

  // J2: tells the workflow's own initiator the outcome — createdByUserId is
  // only set on workflows created after that column existed, so a legacy
  // row just doesn't get this (best-effort, not a hard requirement).
  const notifyInitiator = async (title: string, body: string) => {
    if (!owningWorkflow?.createdByUserId) return;
    await notificationsService.create({
      recipientUserId: owningWorkflow.createdByUserId,
      title,
      body,
      link: "/workflows",
      projectCode: owningWorkflow.projectCode,
    });
  };

  if (input.decision === "reject") {
    await repo.updateWorkflowStatus(workflowId, "rejected");
    await syncLinkedProposal("Rejected");
    await notifyInitiator(
      "Workflow rejected",
      `"${owningWorkflow?.title}" (${owningWorkflow?.code}) was rejected at the ${stage.roleLabel} stage.`,
    );
  } else if (input.decision === "revise") {
    await syncLinkedProposal("Revision Requested");
  } else if (input.decision === "approve") {
    const allStages = await repo.findStagesByWorkflow(workflowId);
    const next = allStages.find((s) => s.sequence === stage.sequence + 1);
    if (next) {
      await repo.updateStage(next.id, { status: "current" });
      // J2: the next stage's owning role now has something waiting on them.
      if (owningWorkflow) {
        await notificationsService.notifyProject(owningWorkflow.projectCode, [next.role], {
          title: `${owningWorkflow.title} needs your review`,
          body: `"${owningWorkflow.title}" (${owningWorkflow.code}) is waiting on your ${next.roleLabel} decision.`,
          link: "/workflows",
        });
      }
    } else {
      await repo.updateWorkflowStatus(workflowId, "completed");
      await syncLinkedProposal("Approved");
      await draftPlanForApprovedProposal();
      await syncLinkedBudgetChange();
      await notifyInitiator(
        "Workflow approved",
        `"${owningWorkflow?.title}" (${owningWorkflow?.code}) has completed approval.`,
      );
    }
  }
  // "revise" leaves the workflow status as-is and the stage in
  // "revision-required" — resubmission (setting it back to "current") is a
  // deliberate follow-up action, not automatic.

  // A workflow completing or being rejected can flip gate checks that read
  // workflow status (P4, K4, X4) — refresh whatever phase the project is
  // actually in now, not just roll up workflow completion on its own.
  const decidedWorkflow = await repo.findWorkflowById(workflowId);
  if (decidedWorkflow) {
    await refreshProjectProgress(decidedWorkflow.projectCode);
  }

  return getWorkflowById(workflowId);
};

export interface ResubmitStageInput {
  attachment?: WorkflowAttachmentInput;
}

/**
 * D4: puts a stage that came back "revision-required" back to "current" so
 * its owning role sees it in their queue again. Only the workflow's own
 * initiator, or admin, can do this — same ownership rule as
 * assertCanManageWorkflow, inlined here rather than reused because that
 * helper throws NotFoundError for a missing id, which resubmit's caller
 * (the stage, not the workflow) doesn't have a natural equivalent of.
 */
export const resubmitStage = async (
  workflowId: number,
  stageId: number,
  input: ResubmitStageInput,
  actor: { role: string; name: string },
): Promise<WorkflowWithStages> => {
  const workflow = await repo.findWorkflowById(workflowId);
  if (!workflow) throw new NotFoundError("Workflow", String(workflowId));
  if (actor.role !== "admin" && workflow.createdBy !== actor.name) {
    throw new ForbiddenError("Only the workflow's initiator, or Admin, can resubmit a stage");
  }

  const stage = await repo.findStageById(stageId);
  if (!stage || stage.workflowId !== workflowId) {
    throw new NotFoundError("Workflow stage", String(stageId));
  }
  if (stage.status !== "revision-required") {
    throw new ValidationError(
      `Stage ${stageId} is '${stage.status}', not 'revision-required' — nothing to resubmit`,
    );
  }

  await assertProjectWritable(workflow.projectCode);

  await repo.updateStage(stageId, { status: "current", decidedBy: null, decidedAt: null, comments: null });

  if (input.attachment) {
    await repo.insertAttachments([toAttachmentRow(input.attachment, workflowId, stageId, actor.name)]);
  }

  await notificationsService.create({
    recipientRole: stage.role,
    title: "Workflow resubmitted",
    body: `"${workflow.title}" (${workflow.code}) was resubmitted and is waiting on your ${stage.roleLabel} decision again.`,
    link: `/workflows`,
    projectCode: workflow.projectCode,
  });

  await refreshProjectProgress(workflow.projectCode);

  return getWorkflowById(workflowId);
};

// ── Approval queue ─────────────────────────────────────────────────────────

const ageLabel = (from: Date | null): string => {
  if (!from) return "—";
  const hours = (Date.now() - from.getTime()) / (1000 * 60 * 60);
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
};

// Read-scope only: admin/it-designer see every role's pending stages instead
// of just their own. IT Designer can still SEE the full queue here — it just
// can't act on any of it (decide/attach are gated to admin and the owning
// role in routes.ts), which is what "read-only" means for this role.
const PRIVILEGED_READ_ROLES = ["admin", "it-designer"];

type QueueRow = Awaited<ReturnType<typeof repo.findPendingStagesForRole>>[number];

const loadQueueRows = async (
  scope: ApprovalScope,
  requesterRole: string,
  requesterName: string,
  visibleCodes?: ReadonlySet<string> | null,
): Promise<QueueRow[]> => {
  const allRows =
    scope === "pending"
      ? await repo.findPendingStagesForRole(requesterRole, PRIVILEGED_READ_ROLES.includes(requesterRole))
      : scope === "mine"
        ? await repo.findDecidedStagesBy(requesterName)
        : await repo.findAllDecidedStages();
  // A stage owner only sees the queue entries of projects they may see.
  return filterRowsToCodes(allRows, visibleCodes ?? null, (r) => r.workflow.projectCode);
};

// A queue row that does not say whether anything was submitted gives the
// approver no reason to open the detail view at all, so each row carries the
// attachment and line-item counts of its workflow.
const toQueueItems = async (rows: QueueRow[]): Promise<ApprovalQueueItem[]> => {
  const workflowIds = [...new Set(rows.map((r) => r.workflow.id))];
  const [attachmentCounts, lineItemCounts] = await Promise.all([
    repo.countAttachmentsByWorkflow(workflowIds),
    repo.countLineItemsByWorkflow(workflowIds),
  ]);

  return rows.map(({ stage, workflow }) => ({
    stageId: stage.id,
    workflowId: workflow.id,
    workflowCode: workflow.code,
    title: workflow.title,
    projectCode: workflow.projectCode,
    type: workflow.type,
    amount: workflow.amount,
    severity: workflow.severity,
    aiNote: workflow.aiNote,
    ownerRoleLabel: stage.roleLabel,
    status: stage.status,
    assignedTo: stage.assignedTo,
    decidedBy: stage.decidedBy,
    decidedAt: stage.decidedAt,
    createdAt: stage.createdAt,
    // G2: lets the approvals queue filter by who raised the request.
    requestedBy: workflow.createdBy,
    attachmentCount: attachmentCounts.get(workflow.id) ?? 0,
    lineItemCount: lineItemCounts.get(workflow.id) ?? 0,
  }));
};

export const getApprovalQueue = async (
  scope: ApprovalScope,
  requesterRole: string,
  requesterName: string,
  /** Project codes the caller may see; null/undefined = no restriction (admin, HR, Finance…). */
  visibleCodes?: ReadonlySet<string> | null,
): Promise<ApprovalQueueItem[]> =>
  toQueueItems(await loadQueueRows(scope, requesterRole, requesterName, visibleCodes));

export const APPROVAL_SORTABLE = ["createdAt", "decidedAt", "title", "projectCode"] as const;

const QUEUE_SORTERS: Record<string, (a: QueueRow, b: QueueRow) => number> = {
  createdAt: byDate<QueueRow>((r) => r.stage.createdAt),
  decidedAt: byDate<QueueRow>((r) => r.stage.decidedAt),
  title: byString<QueueRow>((r) => r.workflow.title),
  projectCode: byString<QueueRow>((r) => r.workflow.projectCode),
};

/** One page of the queue; attachment / line-item counts are computed for this page's workflows only. */
export const getApprovalQueuePage = async (
  scope: ApprovalScope,
  requesterRole: string,
  requesterName: string,
  visibleCodes: ReadonlySet<string> | null | undefined,
  request: PageRequest,
  filters: ApprovalQueueFilters = {},
) => {
  // The queue's own order (oldest pending first / newest decision first) is the default.
  const rows = await loadQueueRows(scope, requesterRole, requesterName, visibleCodes);
  const { items, meta } = paginateRows(rows.filter(queueFilter(filters)), request, QUEUE_SORTERS);
  return {
    items: await toQueueItems(items),
    // Filter choices come from the whole queue, not the filtered page.
    meta: {
      ...meta,
      types: distinctSorted(rows.map((r) => r.workflow.type)),
      requesters: distinctSorted(rows.map((r) => r.workflow.createdBy)),
    },
  };
};

export interface ApprovalQueueFilters {
  type?: string;
  requestedBy?: string;
  /** Inclusive dates, YYYY-MM-DD, compared with the stage's created date (UTC). */
  from?: string;
  to?: string;
  search?: string;
}

const distinctSorted = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.filter((v): v is string => !!v))).sort();

const queueFilter = (f: ApprovalQueueFilters) => (r: QueueRow) => {
  if (f.type && r.workflow.type !== f.type) return false;
  if (f.requestedBy && r.workflow.createdBy !== f.requestedBy) return false;
  const day = r.stage.createdAt ? new Date(r.stage.createdAt).toISOString().slice(0, 10) : null;
  if (f.from && (!day || day < f.from)) return false;
  if (f.to && (!day || day > f.to)) return false;
  if (f.search) {
    const term = f.search.toLowerCase();
    const haystack = `${r.workflow.code} ${r.workflow.title} ${r.workflow.projectCode} ${r.workflow.createdBy ?? ""}`.toLowerCase();
    if (!haystack.includes(term)) return false;
  }
  return true;
};

export const getApprovalStats = async (
  requesterRole: string,
  _requesterName: string,
  visibleCodes?: ReadonlySet<string> | null,
) => {
  const stats = await repo.findApprovalStats(
    requesterRole,
    PRIVILEGED_READ_ROLES.includes(requesterRole),
    visibleCodes ? [...visibleCodes] : null,
  );

  return {
    pending: stats.pending,
    overdue: stats.overdue,
    avgCycleDays: Number(stats.avgDays.toFixed(1)),
    thisWeek: stats.thisWeek,
  };
};

export { ageLabel };