import { and, desc, eq, ilike, inArray, or, sql, SQL } from "drizzle-orm";
import { countRows, inCodes, selectPage } from "../db/paged.js";
import { db } from "../db/connection.js";
import {
  workflowAttachments,
  workflowLineItems,
  workflowStages,
  workflowTemplates,
  workflows,
} from "../db/schema/workflows.js";

// ── Templates ──────────────────────────────────────────────────────────────

export const findAllTemplates = async () => {
  return db.select().from(workflowTemplates).orderBy(workflowTemplates.id);
};

export const findTemplateById = async (id: number) => {
  const [row] = await db
    .select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.id, id));
  return row ?? null;
};

export const insertTemplate = async (data: typeof workflowTemplates.$inferInsert) => {
  const [created] = await db.insert(workflowTemplates).values(data).returning();
  return created ?? null;
};

// workflows.template_id has no onDelete rule, so a template with any workflow
// (active or historical) still pointing at it would fail this at the FK —
// service.deleteTemplate checks for that first and raises a clearer error.
export const deleteTemplate = async (id: number) => {
  const [deleted] = await db
    .delete(workflowTemplates)
    .where(eq(workflowTemplates.id, id))
    .returning();
  return deleted ?? null;
};

export const countActiveByTemplate = async (): Promise<Map<number, number>> => {
  const rows = await db
    .select({
      templateId: workflows.templateId,
      count: sql<number>`count(*)::int`,
    })
    .from(workflows)
    .where(eq(workflows.status, "active"))
    .groupBy(workflows.templateId);

  const map = new Map<number, number>();
  for (const row of rows) {
    if (row.templateId !== null) map.set(row.templateId, row.count);
  }
  return map;
};

// ── Workflows ──────────────────────────────────────────────────────────────

export const findWorkflows = async (status?: string) => {
  const query = db.select().from(workflows).orderBy(desc(workflows.createdAt));
  return status ? query.where(eq(workflows.status, status)) : query;
};

/** Workflows of the given projects only (newest first, like findWorkflows). */
export const findWorkflowsForProjects = async (projectCodes: string[]) =>
  projectCodes.length === 0
    ? []
    : db
        .select()
        .from(workflows)
        .where(inArray(workflows.projectCode, projectCodes))
        .orderBy(desc(workflows.createdAt));

// ── Paged workflow list ────────────────────────────────────────────────────

export interface WorkflowListFilters {
  status?: string;
  /** Restrict to these project codes (visibility scope; set by the controller). */
  codes?: string[];
  projectCode?: string;
  search?: string;
}

const workflowConditions = (filters: WorkflowListFilters): SQL[] => {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(workflows.status, filters.status));
  if (filters.codes) conditions.push(inCodes(workflows.projectCode, filters.codes));
  if (filters.projectCode) conditions.push(eq(workflows.projectCode, filters.projectCode));
  if (filters.search) {
    const s = `%${filters.search}%`;
    conditions.push(or(ilike(workflows.title, s), ilike(workflows.code, s), ilike(workflows.projectCode, s))!);
  }
  return conditions;
};

export const WORKFLOW_SORT_COLUMNS = {
  title: workflows.title,
  code: workflows.code,
  projectCode: workflows.projectCode,
  status: workflows.status,
  type: workflows.type,
  severity: workflows.severity,
  createdAt: workflows.createdAt,
  updatedAt: workflows.updatedAt,
} as const;

export const defaultWorkflowOrder = [desc(workflows.createdAt), desc(workflows.id)];

export const countWorkflows = async (filters: WorkflowListFilters) => {
  const conditions = workflowConditions(filters);
  return countRows(workflows, conditions.length ? and(...conditions) : undefined);
};

export const findWorkflowsPage = async (
  filters: WorkflowListFilters,
  window: { limit: number; offset: number },
  orderBy: SQL[],
) => {
  const conditions = workflowConditions(filters);
  return selectPage(workflows, conditions.length ? and(...conditions) : undefined, orderBy, window);
};

export const findWorkflowById = async (id: number) => {
  const [row] = await db.select().from(workflows).where(eq(workflows.id, id));
  return row ?? null;
};

export const findStagesForWorkflows = async (workflowIds: number[]) => {
  if (workflowIds.length === 0) return [];
  return db
    .select()
    .from(workflowStages)
    .where(inArray(workflowStages.workflowId, workflowIds))
    .orderBy(workflowStages.workflowId, workflowStages.sequence);
};

export const nextWorkflowSeq = async (): Promise<number> => {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${workflows.id}), 0)` })
    .from(workflows);
  return (row?.max ?? 0) + 1;
};

export const insertWorkflow = async (data: typeof workflows.$inferInsert) => {
  const [created] = await db.insert(workflows).values(data).returning();
  return created;
};

export const insertStages = async (rows: (typeof workflowStages.$inferInsert)[]) => {
  if (rows.length === 0) return [];
  return db.insert(workflowStages).values(rows).returning();
};

export const updateWorkflowStatus = async (id: number, status: string) => {
  const [updated] = await db
    .update(workflows)
    .set({ status, updatedAt: new Date() })
    .where(eq(workflows.id, id))
    .returning();
  return updated ?? null;
};

export const updateWorkflow = async (id: number, data: Partial<typeof workflows.$inferInsert>) => {
  const [updated] = await db
    .update(workflows)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(workflows.id, id))
    .returning();
  return updated ?? null;
};

// workflow_stages.workflow_id has onDelete: "cascade" — deleting the
// workflow row cascades the stage rows automatically.
export const deleteWorkflow = async (id: number) => {
  const [deleted] = await db.delete(workflows).where(eq(workflows.id, id)).returning();
  return deleted ?? null;
};

// ── Stages ─────────────────────────────────────────────────────────────────

export const findStageById = async (id: number) => {
  const [row] = await db.select().from(workflowStages).where(eq(workflowStages.id, id));
  return row ?? null;
};

export const findStagesByWorkflow = async (workflowId: number) => {
  return db
    .select()
    .from(workflowStages)
    .where(eq(workflowStages.workflowId, workflowId))
    .orderBy(workflowStages.sequence);
};

export const updateStage = async (
  id: number,
  data: Partial<typeof workflowStages.$inferInsert>,
) => {
  const [updated] = await db
    .update(workflowStages)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(workflowStages.id, id))
    .returning();
  return updated ?? null;
};

// ── Approval queue views ─────────────────────────────────────────────────────

export const findPendingStagesForRole = async (role: string, isPrivileged: boolean) => {
  const condition = isPrivileged
    ? eq(workflowStages.status, "current")
    : and(eq(workflowStages.status, "current"), eq(workflowStages.role, role));

  return db
    .select({ stage: workflowStages, workflow: workflows })
    .from(workflowStages)
    .innerJoin(workflows, eq(workflowStages.workflowId, workflows.id))
    .where(condition)
    .orderBy(workflowStages.createdAt);
};

/**
 * Counts behind GET /workflows/approvals/stats, computed in SQL. The old code
 * loaded the pending queue AND every decided stage in the system, plus their
 * attachments and line items, only to count them. Same definitions:
 *  - pending: stages in "current" for this role (admin / it-designer: every role)
 *  - overdue: pending for more than 48 hours
 *  - history: stages decided "done" or "rejected" (any decider)
 *  - avgCycleDays: mean of decided_at - created_at over history rows that have both
 *  - thisWeek: history rows decided in the last 7 days
 * `codes` restricts to workflows of those projects (null = no restriction).
 */
export const findApprovalStats = async (
  role: string,
  isPrivileged: boolean,
  codes: readonly string[] | null,
) => {
  const scope = codes ? inCodes(workflows.projectCode, codes) : undefined;

  const [pendingRow] = await db
    .select({
      pending: sql<number>`count(*)::int`,
      overdue: sql<number>`(count(*) filter (where ${workflowStages.createdAt} < now() - interval '48 hours'))::int`,
    })
    .from(workflowStages)
    .innerJoin(workflows, eq(workflowStages.workflowId, workflows.id))
    .where(
      and(
        eq(workflowStages.status, "current"),
        isPrivileged ? undefined : eq(workflowStages.role, role),
        scope,
      ),
    );

  const [historyRow] = await db
    .select({
      avgDays: sql<string | null>`avg(extract(epoch from (${workflowStages.decidedAt} - ${workflowStages.createdAt})) / 86400.0) filter (where ${workflowStages.createdAt} is not null and ${workflowStages.decidedAt} is not null)`,
      thisWeek: sql<number>`(count(*) filter (where ${workflowStages.decidedAt} >= now() - interval '7 days'))::int`,
    })
    .from(workflowStages)
    .innerJoin(workflows, eq(workflowStages.workflowId, workflows.id))
    .where(and(inArray(workflowStages.status, ["done", "rejected"]), scope));

  return {
    pending: pendingRow?.pending ?? 0,
    overdue: pendingRow?.overdue ?? 0,
    avgDays: historyRow?.avgDays == null ? 0 : Number(historyRow.avgDays),
    thisWeek: historyRow?.thisWeek ?? 0,
  };
};

export const findDecidedStagesBy = async (decidedBy: string) => {
  return db
    .select({ stage: workflowStages, workflow: workflows })
    .from(workflowStages)
    .innerJoin(workflows, eq(workflowStages.workflowId, workflows.id))
    .where(eq(workflowStages.decidedBy, decidedBy))
    .orderBy(desc(workflowStages.decidedAt));
};

export const findAllDecidedStages = async () => {
  return db
    .select({ stage: workflowStages, workflow: workflows })
    .from(workflowStages)
    .innerJoin(workflows, eq(workflowStages.workflowId, workflows.id))
    .where(inArray(workflowStages.status, ["done", "rejected"]))
    .orderBy(desc(workflowStages.decidedAt));
};
// ── Attachments ────────────────────────────────────────────────────────────

export const findAttachmentsForWorkflows = async (workflowIds: number[]) => {
  if (workflowIds.length === 0) return [];
  // Left join so an attachment filed before its stage was known (or whose
  // stage row has since gone) still comes back, just without a stage label.
  return db
    .select({
      attachment: workflowAttachments,
      stageLabel: workflowStages.roleLabel,
    })
    .from(workflowAttachments)
    .leftJoin(workflowStages, eq(workflowAttachments.stageId, workflowStages.id))
    .where(inArray(workflowAttachments.workflowId, workflowIds))
    .orderBy(workflowAttachments.createdAt);
};

/** workflow id -> attachment count (SQL COUNT, no attachment rows or file text loaded). */
export const countAttachmentsByWorkflow = async (workflowIds: number[]): Promise<Map<number, number>> => {
  if (workflowIds.length === 0) return new Map();
  const rows = await db
    .select({ workflowId: workflowAttachments.workflowId, n: sql<number>`count(*)::int` })
    .from(workflowAttachments)
    .where(inArray(workflowAttachments.workflowId, workflowIds))
    .groupBy(workflowAttachments.workflowId);
  return new Map(rows.map((r) => [r.workflowId, r.n]));
};

/** workflow id -> line item count (SQL COUNT). */
export const countLineItemsByWorkflow = async (workflowIds: number[]): Promise<Map<number, number>> => {
  if (workflowIds.length === 0) return new Map();
  const rows = await db
    .select({ workflowId: workflowLineItems.workflowId, n: sql<number>`count(*)::int` })
    .from(workflowLineItems)
    .where(inArray(workflowLineItems.workflowId, workflowIds))
    .groupBy(workflowLineItems.workflowId);
  return new Map(rows.map((r) => [r.workflowId, r.n]));
};

export const insertAttachments = async (
  rows: (typeof workflowAttachments.$inferInsert)[],
) => {
  if (rows.length === 0) return [];
  return db.insert(workflowAttachments).values(rows).returning();
};

// ── Line items ─────────────────────────────────────────────────────────────

export const findLineItemsForWorkflows = async (workflowIds: number[]) => {
  if (workflowIds.length === 0) return [];
  return db
    .select()
    .from(workflowLineItems)
    .where(inArray(workflowLineItems.workflowId, workflowIds))
    .orderBy(workflowLineItems.id);
};

export const insertLineItems = async (
  rows: (typeof workflowLineItems.$inferInsert)[],
) => {
  if (rows.length === 0) return [];
  return db.insert(workflowLineItems).values(rows).returning();
};

// ── Workflows by template ──────────────────────────────────────────────────

// Finance's budget-change review lists every request raised from the
// Budget Change Request template, regardless of which stage it is sitting on.
export const findWorkflowsByTemplate = async (templateId: number) => {
  return db
    .select()
    .from(workflows)
    .where(eq(workflows.templateId, templateId))
    .orderBy(desc(workflows.createdAt));
};

export const findTemplateByName = async (name: string) => {
  const [row] = await db
    .select()
    .from(workflowTemplates)
    .where(sql`lower(${workflowTemplates.name}) = lower(${name})`);
  return row ?? null;
};

// Every workflow raised against a project — used to roll the project's
// progress up from how far each of its workflows has moved through its
// stages (see workflows/service.ts recomputeProjectProgress).
export const findWorkflowsByProjectCode = async (projectCode: string) => {
  return db.select().from(workflows).where(eq(workflows.projectCode, projectCode));
};
