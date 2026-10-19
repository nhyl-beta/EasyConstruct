// apps/api/src/lifecycle/repository.ts — NEW
//
// Loads everything the gate checks (gates.ts) need for one project in a
// handful of queries, scoped entirely by project code. Deliberately
// self-contained rather than reusing each domain's own repository.findAll —
// those have inconsistent filter shapes (project vs projectCode vs code) and
// pulling from all of them here would coincidentally tie gates.ts to
// whichever filter option each one happens to support. The snapshot is a
// plain object, so gates.ts's checks stay pure functions, testable with no
// database at all (see lifecycle/gates.test.ts).
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../../../core/db/connection.js";
import { projects } from "../../../core/db/schema/projects.js";
import { projectMembers } from "../../../core/db/schema/project-members.js";
import { proposals } from "../../../core/db/schema/proposals.js";
import { workflows, workflowStages } from "../../../core/db/schema/workflows.js";
import { documents } from "../../../core/db/schema/documents.js";
import { designs } from "../../../core/db/schema/designs.js";
import { designReviews } from "../../../core/db/schema/design-reviews.js";
import { blueprints } from "../../../core/db/schema/blueprints.js";
import { requirements } from "../../../core/db/schema/requirements.js";
import { budgets } from "../../../core/db/schema/finance.js";
import { milestones, milestoneLinks } from "../../../core/db/schema/milestones.js";
import { employees } from "../../../core/db/schema/employees.js";
import { tasks } from "../../../core/db/schema/task.js";
import { issues } from "../../../core/db/schema/issues.js";
import { engineeringReports } from "../../../core/db/schema/engineering-reports.js";
import { payrollBatches } from "../../../core/db/schema/finance.js";
import { projectPhaseHistory } from "../../../core/db/schema/project-phase-history.js";
import { workflowTemplates } from "../../../core/db/schema/workflows.js";
import { validationResults } from "../../../core/db/schema/ai-validation.js";
import { findOpenRequests } from "../../design/index.js";
import { projectDeliverables } from "../../../core/db/schema/project-deliverables.js";
import { DESIGN_TURNOVER_TEMPLATE_NAME } from "./delivery.js";
import { procurementOrders, purchaseRequests } from "../../../core/db/schema/finance.js";
import { unsettledIds } from "../../finance/index.js";

// Gate X4 needs to know which workflows were raised from the "Project
// Closeout" template (H3) without gates.ts — a pure-function module — ever
// touching the database itself, so the id is resolved once here and carried
// on the snapshot instead.
export const CLOSEOUT_TEMPLATE_NAME = "Project Closeout";

export type LifecycleSnapshot = NonNullable<Awaited<ReturnType<typeof loadSnapshot>>>;

const groupBy = <T>(rows: T[], keyOf: (row: T) => string | number | null | undefined) => {
  const grouped = new Map<string | number, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key == null) continue;
    const list = grouped.get(key);
    if (list) list.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
};

const none = <T>(): T[] => [];

/**
 * Snapshots for several projects in a fixed number of queries (one per table,
 * `project_code IN (…)`), instead of ~17 queries per project. The cross-project
 * dashboards (my-actions, impact awareness) used to call the single-project
 * loader once per active project; each table is now read once and grouped.
 * Projects that do not exist are absent from the returned map.
 */
export const loadSnapshots = async (projectCodes: string[]) => {
  const codes = [...new Set(projectCodes)];

  const [projectRows, memberRows] = codes.length
    ? await Promise.all([
        db.select().from(projects).where(inArray(projects.code, codes)),
        db.select().from(projectMembers).where(inArray(projectMembers.projectCode, codes)),
      ])
    : [[], []];
  const found = projectRows.map((p) => p.code);

  const empty = found.length === 0;
  const [
    proposalRows,
    documentRows,
    designRows,
    blueprintRows,
    requirementRows,
    budgetRows,
    milestoneRows,
    taskRows,
    issueRows,
    engineeringReportRows,
    payrollBatchRows,
    workflowRows,
    phaseHistoryRows,
    openRequestRows,
    deliverableRows,
    validationRows,
  ] = empty
    ? [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []]
    : await Promise.all([
        db.select().from(proposals).where(inArray(proposals.projectCode, found)),
        db.select().from(documents).where(inArray(documents.project, found)),
        db.select().from(designs).where(inArray(designs.projectCode, found)),
        db.select().from(blueprints).where(inArray(blueprints.projectCode, found)),
        db.select().from(requirements).where(inArray(requirements.project, found)),
        db.select().from(budgets).where(inArray(budgets.project, found)),
        db.select().from(milestones).where(inArray(milestones.projectCode, found)),
        db.select().from(tasks).where(inArray(tasks.projectCode, found)),
        db.select().from(issues).where(inArray(issues.projectCode, found)),
        db.select().from(engineeringReports).where(inArray(engineeringReports.project, found)),
        db.select().from(payrollBatches).where(inArray(payrollBatches.projectCode, found)),
        db.select().from(workflows).where(inArray(workflows.projectCode, found)),
        db.select().from(projectPhaseHistory).where(inArray(projectPhaseHistory.projectCode, found)),
        findOpenRequests(found),
        db.select().from(projectDeliverables).where(inArray(projectDeliverables.projectCode, found)),
        db.select().from(validationResults).where(inArray(validationResults.projectCode, found)),
      ]);

  const designIds = designRows.map((d) => d.id);
  const milestoneIds = milestoneRows.map((m) => m.id);
  const workflowIds = workflowRows.map((w) => w.id);
  const staffedUserIds = [...new Set(memberRows.map((m) => m.userId))];

  const [reviewRows, milestoneLinkRows, stageRows, employeeRows, templateRows] = empty
    ? [[], [], [], [], []]
    : await Promise.all([
        designIds.length ? db.select().from(designReviews).where(inArray(designReviews.designId, designIds)) : Promise.resolve([]),
        milestoneIds.length ? db.select().from(milestoneLinks).where(inArray(milestoneLinks.milestoneId, milestoneIds)) : Promise.resolve([]),
        workflowIds.length ? db.select().from(workflowStages).where(inArray(workflowStages.workflowId, workflowIds)) : Promise.resolve([]),
        staffedUserIds.length ? db.select().from(employees).where(inArray(employees.userId, staffedUserIds)) : Promise.resolve([]),
        db
          .select()
          .from(workflowTemplates)
          .where(inArray(workflowTemplates.name, [DESIGN_TURNOVER_TEMPLATE_NAME, CLOSEOUT_TEMPLATE_NAME])),
      ]);

  // Closeout / Turnover gate: purchase requests and orders that are
  // still in flight. Only id, project and status are read.
  type StatusRow = { id: string; project: string | null; status: string };
  const [requestStatusRows, orderStatusRows]: [StatusRow[], StatusRow[]] = empty
    ? [[], []]
    : await Promise.all([
        db.select({ id: purchaseRequests.id, project: purchaseRequests.project, status: purchaseRequests.status }).from(purchaseRequests).where(inArray(purchaseRequests.project, found)),
        db.select({ id: procurementOrders.id, project: procurementOrders.project, status: procurementOrders.status }).from(procurementOrders).where(inArray(procurementOrders.project, found)),
      ]);
  const purchaseRequestsBy = groupBy(requestStatusRows, (r) => r.project);
  const ordersBy = groupBy(orderStatusRows, (r) => r.project);

  const turnoverTemplate = templateRows.find((t) => t.name === DESIGN_TURNOVER_TEMPLATE_NAME);
  const closeoutTemplate = templateRows.find((t) => t.name === CLOSEOUT_TEMPLATE_NAME);

  // Resolved issues carrying notes, for every category that is open on ANY of
  // these projects — one query. Each project then keeps up to 3 per category
  // among ITS open categories, newest first (the same rule as before).
  const openCategoriesByProject = new Map<string, Set<string>>();
  for (const issue of issueRows) {
    if (issue.status !== "Submitted" && issue.status !== "Under Review") continue;
    const set = openCategoriesByProject.get(issue.projectCode) ?? new Set<string>();
    set.add(issue.category);
    openCategoriesByProject.set(issue.projectCode, set);
  }
  const allOpenCategories = [...new Set([...openCategoriesByProject.values()].flatMap((set) => [...set]))];
  const resolvedWithNotes = allOpenCategories.length
    ? await db
        .select({
          id: issues.id,
          issueCode: issues.issueCode,
          projectCode: issues.projectCode,
          title: issues.title,
          description: issues.description,
          category: issues.category,
          resolutionNotes: issues.resolutionNotes,
          updatedAt: issues.updatedAt,
        })
        .from(issues)
        .where(
          and(
            eq(issues.status, "Resolved"),
            inArray(issues.category, allOpenCategories),
            isNotNull(issues.resolutionNotes),
          ),
        )
        .orderBy(desc(issues.updatedAt))
    : [];

  type Precedent = {
    id: number;
    issueCode: string;
    projectCode: string;
    title: string;
    description: string;
    category: string;
    resolutionNotes: string;
    updatedAt: Date | null;
  };
  const precedentsFor = (projectCode: string): Precedent[] => {
    const categories = openCategoriesByProject.get(projectCode);
    if (!categories || categories.size === 0) return [];
    const byCategory = new Map<string, Precedent[]>();
    for (const row of resolvedWithNotes) {
      if (!categories.has(row.category)) continue;
      if (!row.resolutionNotes || row.resolutionNotes.trim() === "") continue;
      const list = byCategory.get(row.category) ?? [];
      if (list.length < 3) {
        list.push({ ...row, resolutionNotes: row.resolutionNotes });
        byCategory.set(row.category, list);
      }
    }
    return Array.from(byCategory.values()).flat();
  };

  const membersBy = groupBy(memberRows, (r) => r.projectCode);
  const proposalsBy = groupBy(proposalRows, (r) => r.projectCode);
  const documentsBy = groupBy(documentRows, (r) => r.project);
  const designsBy = groupBy(designRows, (r) => r.projectCode);
  const blueprintsBy = groupBy(blueprintRows, (r) => r.projectCode);
  const requirementsBy = groupBy(requirementRows, (r) => r.project);
  const budgetsBy = groupBy(budgetRows, (r) => r.project);
  const milestonesBy = groupBy(milestoneRows, (r) => r.projectCode);
  const tasksBy = groupBy(taskRows, (r) => r.projectCode);
  const issuesBy = groupBy(issueRows, (r) => r.projectCode);
  const reportsBy = groupBy(engineeringReportRows, (r) => r.project);
  const batchesBy = groupBy(payrollBatchRows, (r) => r.projectCode);
  const workflowsBy = groupBy(workflowRows, (r) => r.projectCode);
  const historyBy = groupBy(phaseHistoryRows, (r) => r.projectCode);
  const requestsBy = groupBy(openRequestRows, (r) => r.projectCode);
  const deliverablesBy = groupBy(deliverableRows, (r) => r.projectCode);
  const validationBy = groupBy(validationRows, (r) => r.projectCode);
  const reviewsByDesign = groupBy(reviewRows, (r) => r.designId);
  const linksByMilestone = groupBy(milestoneLinkRows, (r) => r.milestoneId);
  const stagesByWorkflow = groupBy(stageRows, (r) => r.workflowId);

  const assemble = (project: (typeof projectRows)[number]) => {
    const code = project.code;
    const projectDesigns = designsBy.get(code) ?? none<(typeof designRows)[number]>();
    const projectMilestones = milestonesBy.get(code) ?? none<(typeof milestoneRows)[number]>();
    const projectWorkflows = workflowsBy.get(code) ?? none<(typeof workflowRows)[number]>();
    const projectProposals = proposalsBy.get(code) ?? none<(typeof proposalRows)[number]>();
    const members = membersBy.get(code) ?? none<(typeof memberRows)[number]>();

    // A proposal's workflow always shares its project code, so resolve the
    // proposals' workflow ids against this project's own workflows.
    const proposalWorkflowIds = projectProposals
      .map((p) => p.workflowId)
      .filter((id): id is number => id != null);
    const staffed = new Set(members.map((m) => m.userId));

    return {
      project,
      members,
      proposals: projectProposals,
      proposalWorkflows:
        proposalWorkflowIds.length > 0
          ? projectWorkflows.filter((w) => proposalWorkflowIds.includes(w.id))
          : none<(typeof workflowRows)[number]>(),
      documents: documentsBy.get(code) ?? none<(typeof documentRows)[number]>(),
      designs: projectDesigns,
      designReviews: projectDesigns.flatMap((d) => reviewsByDesign.get(d.id) ?? none<(typeof reviewRows)[number]>()),
      blueprints: blueprintsBy.get(code) ?? none<(typeof blueprintRows)[number]>(),
      requirements: requirementsBy.get(code) ?? none<(typeof requirementRows)[number]>(),
      budgets: budgetsBy.get(code) ?? none<(typeof budgetRows)[number]>(),
      milestones: projectMilestones,
      milestoneLinks: projectMilestones.flatMap((m) => linksByMilestone.get(m.id) ?? none<(typeof milestoneLinkRows)[number]>()),
      tasks: tasksBy.get(code) ?? none<(typeof taskRows)[number]>(),
      issues: issuesBy.get(code) ?? none<(typeof issueRows)[number]>(),
      engineeringReports: reportsBy.get(code) ?? none<(typeof engineeringReportRows)[number]>(),
      payrollBatches: batchesBy.get(code) ?? none<(typeof payrollBatchRows)[number]>(),
      workflows: projectWorkflows,
      workflowStages: projectWorkflows.flatMap((w) => stagesByWorkflow.get(w.id) ?? none<(typeof stageRows)[number]>()),
      phaseHistory: historyBy.get(code) ?? none<(typeof phaseHistoryRows)[number]>(),
      staffedEmployees: employeeRows.filter((e) => e.userId != null && staffed.has(e.userId)),
      closeoutTemplateId: closeoutTemplate?.id ?? null,
      // Gate X5: RFI/RFA requests that are still open (drafts included).
      openRequests: requestsBy.get(code) ?? none<(typeof openRequestRows)[number]>(),
      // Closeout / Turnover gate: ids of unsettled purchase requests and orders.
      unsettledPurchasing: unsettledIds({
        requests: purchaseRequestsBy.get(code) ?? none<StatusRow>(),
        orders: ordersBy.get(code) ?? none<StatusRow>(),
      }),
      // Design delivery: the plan sets and the Design Turnover template (gate T3).
      deliverables: deliverablesBy.get(code) ?? none<(typeof deliverableRows)[number]>(),
      designTurnoverTemplateId: turnoverTemplate?.id ?? null,
      // ai-signals D2: decision-support-only fields, read by signals/*.ts, never
      // by gates.ts. validationResults is scoped to this project;
      // issuePrecedents deliberately draws on resolved issues from every
      // project but exposes only fields safe to show across a project boundary.
      validationResults: validationBy.get(code) ?? none<(typeof validationRows)[number]>(),
      issuePrecedents: precedentsFor(code),
    };
  };

  const snapshots = new Map<string, ReturnType<typeof assemble>>();
  for (const project of projectRows) snapshots.set(project.code, assemble(project));
  return snapshots;
};

export const loadSnapshot = async (projectCode: string) =>
  (await loadSnapshots([projectCode])).get(projectCode) ?? null;

/** Advance (Proposal -> Design) of a Design project: one plan set per chosen discipline. Idempotent. */
export const ensureDeliverables = async (projectCode: string, disciplines: string[]) => {
  if (disciplines.length === 0) return;
  await db
    .insert(projectDeliverables)
    .values(disciplines.map((discipline) => ({ projectCode, discipline })))
    .onConflictDoNothing();
};

export const insertPhaseHistory = async (row: {
  projectCode: string;
  fromStatus: string;
  toStatus: string;
  changedBy: string;
  changedByUserId: number | null;
  reason?: string | null;
  override?: boolean;
  gateSnapshot?: unknown;
}) => {
  const [created] = await db
    .insert(projectPhaseHistory)
    .values({
      projectCode: row.projectCode,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      changedBy: row.changedBy,
      changedByUserId: row.changedByUserId,
      reason: row.reason ?? null,
      override: row.override ?? false,
      gateSnapshot: row.gateSnapshot ?? null,
    })
    .returning();
  return created;
};

/** Phase history of several projects in one query, grouped by code (each group oldest first). */
export const findPhaseHistoryForProjects = async (projectCodes: string[]) => {
  const grouped = new Map<string, (typeof projectPhaseHistory.$inferSelect)[]>();
  if (projectCodes.length === 0) return grouped;
  const rows = await db
    .select()
    .from(projectPhaseHistory)
    .where(inArray(projectPhaseHistory.projectCode, projectCodes))
    .orderBy(projectPhaseHistory.createdAt);
  for (const row of rows) {
    const list = grouped.get(row.projectCode) ?? [];
    list.push(row);
    grouped.set(row.projectCode, list);
  }
  return grouped;
};

export const findPhaseHistory = async (projectCode: string) =>
  db
    .select()
    .from(projectPhaseHistory)
    .where(eq(projectPhaseHistory.projectCode, projectCode))
    .orderBy(projectPhaseHistory.createdAt);
