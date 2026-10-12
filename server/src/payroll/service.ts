import { refreshMonth } from "../finance/cash-flow/service.js";
import { monthKey } from "../finance/cash-flow/months.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { budgets } from "../db/schema/finance.js";
import { payroll } from "../db/schema/payroll.js";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../utils/errors.js";
import * as employeesRepo from "../employees/repository.js";
import * as attendanceRepo from "../attendance/repository.js";
import * as notifications from "../notifications/service.js";
import { refreshProjectProgress } from "../lifecycle/service.js";
import * as repo from "./repository.js";
import { orderByFor, paginate, type PageRequest } from "../utils/pagination.js";
import * as batchRepo from "./batch-repository.js";
import { computeLine, getRules, periodEndDate, round2, type PayrollRules } from "./engine.js";
import { buildTrace } from "./trace.js";
import { periodRange, unacknowledged, validateBatchLines, type WarningContext } from "./validation.js";
import {
  EDITABLE_BATCH_STATUSES,
  REJECTION_REASONS,
  type DecideBatchInput,
  type GeneratePayrollInput,
  type PayrollEntryInput,
  type PayrollFilters,
  type UpdatePayrollLineInput,
  type ValidationIssue,
} from "./types.js";

// Gross Labor = regular hours × hourly rate + overtime hours × hourly rate ×
// overtime multiplier + adjustments, then the engine (./engine.ts) derives the
// four employee deductions, the employer contributions and net. Nothing in
// this module computes or accepts a statutory amount — see engine.ts.

const STANDARD_HOURS_PER_DAY = 8;

// What an approved batch's cost is booked against — every budget seeded for a
// project's labor spend uses this category name.
const LABOR_BUDGET_CATEGORY = "Labor";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type EmployeeRow = NonNullable<Awaited<ReturnType<typeof employeesRepo.findByEmployeeId>>>;
type LineRow = typeof payroll.$inferSelect;
type BatchRow = batchRepo.BatchRow;

export interface Actor {
  name: string;
  role: string;
}

const SYSTEM_ACTOR: Actor = { name: "system", role: "admin" };

// ── Line construction (single path for generate / edit) ─────────────────────

const lineFields = (
  employee: EmployeeRow,
  entry: { hours: number; overtime: number; adjustments: number },
  rules: PayrollRules,
) => {
  const c = computeLine(
    {
      payRate: Number(employee.payRate),
      rateType: employee.rateType,
      regularHours: entry.hours,
      overtimeHours: entry.overtime,
      adjustments: entry.adjustments,
    },
    rules,
  );
  return {
    hours: entry.hours,
    overtime: entry.overtime,
    adjustments: entry.adjustments.toFixed(2),
    gross: c.gross.toFixed(2),
    sss: c.sss.toFixed(2),
    philhealth: c.philhealth.toFixed(2),
    pagibig: c.pagibig.toFixed(2),
    deductions: c.deductions.toFixed(2),
    net: c.net.toFixed(2),
    employerSss: c.employerSss.toFixed(2),
    employerEc: c.employerEc.toFixed(2),
    employerPhilhealth: c.employerPhilhealth.toFixed(2),
    employerPagibig: c.employerPagibig.toFixed(2),
    employerCost: c.employerCost.toFixed(2),
    rateVersions: { ...c.versions },
  };
};

const sumLines = (lines: LineRow[]) => {
  const sum = (pick: (l: LineRow) => string) =>
    round2(lines.reduce((acc, l) => acc + Number(pick(l)), 0));
  return {
    employees: lines.length,
    overtimeHours: round2(lines.reduce((acc, l) => acc + Number(l.overtime), 0)),
    gross: sum((l) => l.gross),
    sss: sum((l) => l.sss),
    philhealth: sum((l) => l.philhealth),
    pagibig: sum((l) => l.pagibig),
    deductions: sum((l) => l.deductions),
    net: sum((l) => l.net),
    employerSss: sum((l) => l.employerSss),
    employerEc: sum((l) => l.employerEc),
    employerPhilhealth: sum((l) => l.employerPhilhealth),
    employerPagibig: sum((l) => l.employerPagibig),
    employerCost: sum((l) => l.employerCost),
  };
};

const syncBatchTotals = async (batchId: string, tx: Tx) => {
  const lines = await repo.findByBatch(batchId, tx);
  const t = sumLines(lines);
  await batchRepo.update(
    batchId,
    {
      employees: t.employees,
      overtimeHours: t.overtimeHours,
      grossPayroll: t.gross,
      deductions: t.deductions,
      netPayroll: t.net,
      employerCost: t.employerCost,
    },
    tx,
  );
  return t;
};

// ── Reads ───────────────────────────────────────────────────────────────────

// Finance never sees a batch HR is still building — nor its lines.
const draftBatchIds = async (actor: Actor): Promise<Set<string>> =>
  actor.role.replace(/_/g, "-") === "finance-manager"
    ? await batchRepo.findDraftIds()
    : new Set();

export const getAll = async (filters: PayrollFilters, actor: Actor = SYSTEM_ACTOR) => {
  const [rows, hidden] = await Promise.all([repo.findAll(filters), draftBatchIds(actor)]);
  return rows.filter((l) => !l.batchId || !hidden.has(l.batchId));
};

/**
 * One page of lines; the Finance draft-batch exclusion is part of the query, so
 * counts match what is shown. With `withTotals`, the sums over the whole filter
 * set (not just this page) come back too.
 */
export const getPage = async (
  filters: PayrollFilters,
  request: PageRequest,
  actor: Actor = SYSTEM_ACTOR,
  withTotals = false,
) => {
  const hidden = await draftBatchIds(actor);
  const scoped: PayrollFilters = { ...filters, ...(hidden.size ? { excludeBatchIds: [...hidden] } : {}) };
  const [page, totals] = await Promise.all([
    paginate(
      request,
      () => repo.countFiltered(scoped),
      (window) =>
        repo.findPage(scoped, window, orderByFor(request, repo.PAYROLL_SORT_COLUMNS, repo.defaultPayrollOrder, payroll.id)),
    ),
    withTotals ? repo.sumFiltered(scoped) : Promise.resolve(undefined),
  ]);
  return totals ? { items: page.items, meta: { ...page.meta, totals } } : page;
};

export const getById = async (id: number, actor: Actor = SYSTEM_ACTOR) => {
  const line = await repo.findById(id);
  if (!line || (line.batchId && (await draftBatchIds(actor)).has(line.batchId)))
    throw new NotFoundError("Payroll line", String(id));
  return line;
};

const hiddenFromRole = (batch: BatchRow, actor: Actor) =>
  batch.status === "draft" && actor.role.replace(/_/g, "-") === "finance-manager";

export const listBatches = async (actor: Actor = SYSTEM_ACTOR) => {
  const rows = await batchRepo.findAll();
  return rows.filter((b) => !hiddenFromRole(b, actor));
};

const loadBatch = async (id: string, actor: Actor = SYSTEM_ACTOR): Promise<BatchRow> => {
  const batch = await batchRepo.findById(id);
  if (!batch || hiddenFromRole(batch, actor)) throw new NotFoundError("Payroll batch", id);
  return batch;
};

// One query for every distinct employee on the batch (was one per line).
const employeesFor = async (lines: LineRow[]): Promise<Map<string, EmployeeRow>> =>
  employeesRepo.findByEmployeeIds(lines.map((l) => l.empId));

// Facts for the acknowledge-before-submit warnings (fix 2.4): unverified
// attendance in the period and the pay rates of people in the same positions.
const warningContextFor = async (batch: BatchRow): Promise<WarningContext> => {
  const period = periodRange(batch.period);
  const unverifiedByEmployee = new Map<string, number>();
  if (batch.projectCode && period) {
    const rows = await attendanceRepo.findForProject({
      projectCode: batch.projectCode,
      dateFrom: period.start,
      dateTo: period.end,
    });
    for (const r of rows) {
      if (r.status === "Verified" || !["Present", "Late", "Half Day"].includes(r.attendanceStatus)) continue;
      unverifiedByEmployee.set(r.employeeId, (unverifiedByEmployee.get(r.employeeId) ?? 0) + 1);
    }
  }
  const peerRates = new Map<string, number[]>();
  for (const e of await employeesRepo.findActivePayRates()) {
    const rate = Number(e.payRate);
    if (!(rate > 0)) continue;
    const key = `${e.role}|${e.rateType}`;
    peerRates.set(key, [...(peerRates.get(key) ?? []), rate]);
  }
  return { period, unverifiedByEmployee, peerRates };
};

export const validateBatch = async (batch: BatchRow, lines: LineRow[]) => {
  const employees = await employeesFor(lines);
  const warningContext = await warningContextFor(batch);
  const duplicates = batch.projectCode
    ? (await batchRepo.findSameProjectPeriod(batch.projectCode, batch.period, batch.id)).map(
        (b) => b.id,
      )
    : [];
  return validateBatchLines(
    lines.map((l) => ({
      empId: l.empId,
      name: l.name,
      hours: Number(l.hours),
      overtime: Number(l.overtime),
      net: Number(l.net),
      rateVersions: l.rateVersions,
    })),
    new Map(
      [...employees].map(([k, e]) => [
        k,
        { status: e.status, payRate: Number(e.payRate), position: e.role, rateType: e.rateType },
      ]),
    ),
    getRules(periodEndDate(batch.period)),
    duplicates,
    warningContext,
  );
};

export const getBatchDetail = async (id: string, actor: Actor = SYSTEM_ACTOR) => {
  const batch = await loadBatch(id, actor);
  const [lines, decisions] = await Promise.all([repo.findByBatch(id), batchRepo.findDecisions(id)]);
  const rules = getRules(periodEndDate(batch.period));
  // Best effort: the history of acknowledged warnings never stops a batch from loading.
  const acknowledgements = await batchRepo.findAcknowledgements(id).catch(() => []);
  return {
    batch,
    lines,
    decisions,
    acknowledgements,
    totals: sumLines(lines),
    rateVersions: rules.versions,
    needsVerification: rules.needsVerification,
    validation: EDITABLE_BATCH_STATUSES.includes(batch.status)
      ? await validateBatch(batch, lines)
      : ([] as ValidationIssue[]),
  };
};

// How one stored line was worked out (fix 2.5): the steps, the attendance behind
// the hours and the rate versions used. Read-only; same visibility as the line.
export const getLineTrace = async (id: number, actor: Actor = SYSTEM_ACTOR) => {
  const line = await getById(id, actor);
  const batch = line.batchId ? await batchRepo.findById(line.batchId) : null;
  const employee = await employeesRepo.findByEmployeeId(line.empId);
  if (!employee) throw new NotFoundError("Employee", line.empId);

  const period = periodRange(batch?.period ?? line.period);
  const rows =
    batch?.projectCode && period
      ? (
          await attendanceRepo.findForProject({
            projectCode: batch.projectCode,
            dateFrom: period.start,
            dateTo: period.end,
          })
        ).filter((r) => r.employeeId === line.empId)
      : [];

  const trace = buildTrace({
    line: {
      hours: Number(line.hours),
      overtime: Number(line.overtime),
      adjustments: Number(line.adjustments),
      gross: Number(line.gross),
      sss: Number(line.sss),
      philhealth: Number(line.philhealth),
      pagibig: Number(line.pagibig),
      deductions: Number(line.deductions),
      net: Number(line.net),
      employerSss: Number(line.employerSss),
      employerEc: Number(line.employerEc),
      employerPhilhealth: Number(line.employerPhilhealth),
      employerPagibig: Number(line.employerPagibig),
      employerCost: Number(line.employerCost),
      rateVersions: line.rateVersions,
    },
    employee: { payRate: Number(employee.payRate), rateType: employee.rateType },
    attendance: rows.map((r) => ({
      id: r.id,
      logDate: r.logDate,
      clockIn: r.clockIn,
      clockOut: r.clockOut,
      hours: Number(r.hours ?? 0),
      attendanceStatus: r.attendanceStatus,
      verification: r.status,
    })),
    rules: getRules(periodEndDate(line.period)),
  });
  return {
    line: { id: line.id, empId: line.empId, name: line.name, period: line.period, batchId: line.batchId },
    notCertified: "Rule-based calculation. Not a certified payroll engine: no 13th-month, de minimis or year-end adjustments.",
    ...trace,
  };
};

export const getBatchValidation = async (id: string) => {
  const batch = await loadBatch(id);
  return validateBatch(batch, await repo.findByBatch(id));
};

// G5: verified attendance for a project/date range, summed to hours worked
// per employee and split into regular/overtime past the standard shift — a
// prefill for the Generate form's entries, not a replacement for it (HR can
// still edit before submitting).
export const getAttendanceSummary = async (
  projectCode: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<PayrollEntryInput[]> => {
  const records = await attendanceRepo.findVerified({ projectCode, dateFrom, dateTo });
  const byEmployee = new Map<string, { hoursWorked: number; overtimeHours: number }>();

  for (const record of records) {
    const hours = Number(record.hours ?? 0);
    if (hours <= 0) continue;
    const regular = Math.min(hours, STANDARD_HOURS_PER_DAY);
    const overtime = Math.max(hours - STANDARD_HOURS_PER_DAY, 0);
    const existing = byEmployee.get(record.employeeId) ?? { hoursWorked: 0, overtimeHours: 0 };
    existing.hoursWorked += regular;
    existing.overtimeHours += overtime;
    byEmployee.set(record.employeeId, existing);
  }

  return Array.from(byEmployee.entries()).map(([employeeId, totals]) => ({
    employeeId,
    hoursWorked: Number(totals.hoursWorked.toFixed(2)),
    overtimeHours: Number(totals.overtimeHours.toFixed(2)),
  }));
};

export interface ExcludedWorker {
  employeeId: string;
  name: string;
  status: string;
  reason: string;
}

// Step 2 of the HR wizard: what verified attendance supports paying, what is
// left out (unverified entries, workers who cannot be paid) and why.
export const getAttendanceReadiness = async (
  projectCode: string,
  dateFrom?: string,
  dateTo?: string,
) => {
  const [summary, all] = await Promise.all([
    getAttendanceSummary(projectCode, dateFrom, dateTo),
    attendanceRepo.findForProject({ projectCode, dateFrom, dateTo }),
  ]);

  const unverified = all.filter((r) => r.status !== "Verified");
  const employeeIds = [...new Set(all.map((r) => r.employeeId))];
  const excluded: ExcludedWorker[] = [];
  const eligible = new Set<string>();

  const rosterById = await employeesRepo.findByEmployeeIds(employeeIds);
  for (const employeeId of employeeIds) {
    const e = rosterById.get(employeeId);
    if (!e) {
      excluded.push({ employeeId, name: employeeId, status: "Unknown", reason: "Not in the employee roster" });
    } else if (e.status !== "Active") {
      excluded.push({
        employeeId,
        name: e.name,
        status: e.status,
        reason: `Status is ${e.status}; only Active workers can be paid`,
      });
    } else if (!(Number(e.payRate) > 0)) {
      excluded.push({
        employeeId,
        name: e.name,
        status: e.status,
        reason: "No pay rate set; HR must approve the worker and set a rate",
      });
    } else {
      eligible.add(employeeId);
    }
  }

  return {
    entries: summary.filter((s) => eligible.has(s.employeeId)),
    unverifiedCount: unverified.length,
    excludedWorkers: excluded,
  };
};

// ── Generate (creates a draft batch with computed lines) ────────────────────

export const generate = async (input: GeneratePayrollInput, actor: Actor = SYSTEM_ACTOR) => {
  if (!input.entries?.length)
    throw new ValidationError("At least one employee entry is required to generate payroll");

  const seen = new Set<string>();
  for (const e of input.entries) {
    if (seen.has(e.employeeId))
      throw new ValidationError(`Employee ${e.employeeId} appears more than once`);
    seen.add(e.employeeId);
  }

  const employeesById = await employeesRepo.findByEmployeeIds(input.entries.map((e) => e.employeeId));
  const employees: EmployeeRow[] = [];
  for (const e of input.entries) {
    const employee = employeesById.get(e.employeeId);
    if (!employee) throw new NotFoundError("Employee", e.employeeId);
    employees.push(employee);
  }

  const rules = getRules(periodEndDate(input.period));
  const batchId = `PAY-${Date.now()}`;

  await db.transaction(async (tx) => {
    await batchRepo.create(
      {
        id: batchId,
        projectCode: input.projectCode ?? null,
        period: input.period,
        group: input.group ?? "All departments",
        employees: 0,
        overtimeHours: 0,
        grossPayroll: 0,
        deductions: 0,
        netPayroll: 0,
        employerCost: 0,
        status: "draft",
      },
      tx,
    );
    await repo.createMany(
      input.entries.map((entry, i) => {
        const employee = employees[i]!;
        return {
          batchId,
          empId: employee.employeeId,
          name: employee.name,
          initials: employee.initials,
          role: employee.role,
          status: "Pending",
          period: input.period,
          ...lineFields(
            employee,
            {
              hours: entry.hoursWorked,
              overtime: entry.overtimeHours ?? 0,
              adjustments: entry.adjustments ?? 0,
            },
            rules,
          ),
        };
      }),
      tx,
    );
    await syncBatchTotals(batchId, tx);
  });

  if (input.submit) {
    await submitBatch(batchId, { confirmDuplicate: input.confirmDuplicate, acknowledgedWarnings: input.acknowledgedWarnings }, actor);
  }

  const batch = await batchRepo.findById(batchId);
  if (!batch) throw new Error("Failed to create payroll batch");
  return { lines: await repo.findByBatch(batchId), batch };
};

// ── Line edits (HR only, draft / revision_required batches) ─────────────────

const editableLine = async (id: number) => {
  const line = await getById(id);
  if (!line.batchId)
    throw new ConflictError("This payroll line pre-dates batches and can no longer be edited");
  const batch = await loadBatch(line.batchId);
  assertEditable(batch);
  return { line, batch };
};

const assertEditable = (batch: BatchRow) => {
  if (!EDITABLE_BATCH_STATUSES.includes(batch.status))
    throw new ConflictError(
      batch.status === "approved"
        ? `Batch ${batch.id} is approved and locked`
        : `Batch ${batch.id} is ${batch.status}; lines can only change while it is a draft or needs revision`,
    );
};

export const update = async (id: number, input: UpdatePayrollLineInput) => {
  const { line, batch } = await editableLine(id);
  const employee = await employeesRepo.findByEmployeeId(line.empId);
  if (!employee) throw new NotFoundError("Employee", line.empId);

  const rules = getRules(periodEndDate(batch.period));
  const fields = lineFields(
    employee,
    {
      hours: input.hours ?? Number(line.hours),
      overtime: input.overtime ?? Number(line.overtime),
      adjustments: input.adjustments ?? Number(line.adjustments),
    },
    rules,
  );

  return db.transaction(async (tx) => {
    const updated = await repo.update(id, fields, tx);
    if (!updated) throw new NotFoundError("Payroll line", String(id));
    await syncBatchTotals(batch.id, tx);
    return updated;
  });
};

export const addLine = async (batchId: string, entry: PayrollEntryInput) => {
  const batch = await loadBatch(batchId);
  assertEditable(batch);
  const employee = await employeesRepo.findByEmployeeId(entry.employeeId);
  if (!employee) throw new NotFoundError("Employee", entry.employeeId);
  const existing = await repo.findByBatch(batchId);
  if (existing.some((l) => l.empId === entry.employeeId))
    throw new ConflictError(`Employee ${entry.employeeId} is already in batch ${batchId}`);

  const rules = getRules(periodEndDate(batch.period));
  return db.transaction(async (tx) => {
    const created = await repo.create(
      {
        batchId,
        empId: employee.employeeId,
        name: employee.name,
        initials: employee.initials,
        role: employee.role,
        status: "Pending",
        period: batch.period,
        ...lineFields(
          employee,
          {
            hours: entry.hoursWorked,
            overtime: entry.overtimeHours ?? 0,
            adjustments: entry.adjustments ?? 0,
          },
          rules,
        ),
      },
      tx,
    );
    await syncBatchTotals(batchId, tx);
    return created;
  });
};

export const remove = async (id: number) => {
  const { batch } = await editableLine(id);
  return db.transaction(async (tx) => {
    const deleted = await repo.remove(id, tx);
    if (!deleted) throw new NotFoundError("Payroll line", String(id));
    await syncBatchTotals(batch.id, tx);
    return deleted;
  });
};

export const removeBatch = async (id: string) => {
  const batch = await loadBatch(id);
  if (batch.status !== "draft")
    throw new ConflictError("Only a draft batch can be discarded");
  await db.transaction(async (tx) => {
    await tx.delete(payroll).where(eq(payroll.batchId, id));
    await batchRepo.removeBatch(id, tx);
  });
  return batch;
};

// ── Submit to Finance ───────────────────────────────────────────────────────

export const submitBatch = async (
  id: string,
  opts: { confirmDuplicate?: boolean; acknowledgedWarnings?: string[] } = {},
  actor: Actor = SYSTEM_ACTOR,
) => {
  const batch = await loadBatch(id);
  assertEditable(batch);

  const lines = await repo.findByBatch(id);
  const issues = await validateBatch(batch, lines);

  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length)
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Batch cannot be submitted: ${errors.map((e) => e.message).join(" ")}`,
      { issues },
    );

  if (issues.some((i) => i.code === "duplicate_batch") && !opts.confirmDuplicate)
    throw new AppError(
      409,
      "DUPLICATE_BATCH",
      "Another batch exists for this project and period. Confirm to submit anyway.",
      { issues },
    );

  // Fix 2.4: unverified attendance, hours outliers and pay-rate mismatches must
  // each be ticked by HR. What was acknowledged is stored against the round.
  const pendingAck = unacknowledged(issues, opts.acknowledgedWarnings ?? []);
  if (pendingAck.length)
    throw new AppError(
      409,
      "WARNINGS_UNACKNOWLEDGED",
      `Acknowledge ${pendingAck.length} warning${pendingAck.length === 1 ? "" : "s"} before submitting.`,
      { issues },
    );

  const resubmission = batch.status === "revision_required";
  const round = resubmission ? batch.round + 1 : batch.round;
  const acknowledged = issues.filter((i) => i.requiresAck && i.key);
  if (acknowledged.length)
    await batchRepo.saveAcknowledgements({
      batchId: id,
      round,
      acknowledgedBy: actor.name,
      items: acknowledged.map((i) => ({ key: i.key!, message: i.message })),
    });

  const submitted = await batchRepo.transition(id, [...EDITABLE_BATCH_STATUSES], {
    status: "pending",
    round,
    submittedAt: new Date(),
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
  });
  if (!submitted) throw new ConflictError(`Batch ${id} was changed by someone else; reload it`);

  if (submitted.projectCode) await refreshProjectProgress(submitted.projectCode);
  await notifications.create({
    recipientRole: "finance-manager",
    projectCode: submitted.projectCode ?? undefined,
    title: resubmission ? "Payroll batch resubmitted" : "Payroll batch awaiting review",
    body: `${submitted.id} (${submitted.period}, ${submitted.employees} employees) was submitted by ${actor.name}.`,
    link: "/payroll-review",
  });
  return submitted;
};

// ── Finance decision ────────────────────────────────────────────────────────

export const decideBatch = async (id: string, input: DecideBatchInput, actor: Actor) => {
  if (input.decision === "rejected") {
    if (!input.reasonCode || !REJECTION_REASONS.includes(input.reasonCode))
      throw new ValidationError("A rejection reason is required");
    if (input.reasonCode === "other" && !input.comment?.trim())
      throw new ValidationError("A comment is required when the reason is Other");
  }

  const decided = await db.transaction(async (tx) => {
    const current = await batchRepo.findById(id, tx);
    if (!current || current.status === "draft") throw new NotFoundError("Payroll batch", id);

    const next = input.decision === "approved" ? "approved" : "revision_required";
    const updated = await batchRepo.transition(
      id,
      ["pending"],
      {
        status: next,
        reviewedBy: actor.name,
        reviewedAt: new Date(),
        reviewNote: input.comment?.trim() || null,
      },
      tx,
    );
    // Not pending any more: already decided this round (or never submitted).
    if (!updated)
      throw new ConflictError(
        `Batch ${id} is ${current.status}; it can only be decided while pending`,
      );

    const decision = await batchRepo.insertDecision(
      {
        batchId: id,
        round: updated.round,
        action: input.decision,
        reasonCode: input.decision === "rejected" ? input.reasonCode! : null,
        comment: input.comment?.trim() || null,
        decidedBy: actor.name,
      },
      tx,
    );

    if (input.decision === "approved" && updated.projectCode) {
      // Book the batch's total employer cost against the project's Labor
      // budget — gross alone would omit the employer's statutory share.
      // Legacy batches created before employer cost existed fall back to gross.
      const amount = updated.employerCost > 0 ? updated.employerCost : updated.grossPayroll;
      const [budget] = await tx
        .select()
        .from(budgets)
        .where(
          and(eq(budgets.project, updated.projectCode), eq(budgets.category, LABOR_BUDGET_CATEGORY)),
        )
        .orderBy(desc(budgets.createdAt))
        .limit(1);
      if (budget) {
        await tx
          .update(budgets)
          .set({ actual: sql`${budgets.actual} + ${amount}`, updatedAt: new Date() })
          .where(eq(budgets.id, budget.id));
      }
      await tx.update(payroll).set({ status: "Completed" }).where(eq(payroll.batchId, id));
    }

    // An approval is cash out: recompute that month of the cash flow chart in
    // the same transaction (a rejection moves no money).
    if (input.decision === "approved" && decision) {
      await refreshMonth(monthKey(decision.decidedAt), tx);
    }

    return updated;
  });

  // Gate X3 reads whether an approved-since-Closeout batch exists and
  // whether any batch is still pending.
  if (decided.projectCode) await refreshProjectProgress(decided.projectCode);

  await notifications.create({
    recipientRole: "human-resources",
    projectCode: decided.projectCode ?? undefined,
    title: input.decision === "approved" ? "Payroll batch approved" : "Payroll batch needs revision",
    body:
      input.decision === "approved"
        ? `${decided.id} (${decided.period}) was approved by ${actor.name}.`
        : `${decided.id} (${decided.period}) was sent back: ${input.reasonCode}${
            input.comment ? ` — ${input.comment}` : ""
          }`,
    link: "/payroll",
  });

  return decided;
};

// ── Reports ─────────────────────────────────────────────────────────────────

const AGENCIES = ["sss", "philhealth", "pagibig"] as const;
export type Agency = (typeof AGENCIES)[number];
export const isAgency = (v: unknown): v is Agency => AGENCIES.includes(v as Agency);

// Employee share + employer share per employee for one agency and period,
// across approved batches only (a liability exists once Finance approves).
export const contributionReport = async (agency: Agency, period: string) => {
  const batches = await batchRepo.findApprovedForPeriod(period);
  const linesByBatch = await repo.findByBatches(batches.map((b) => b.id));
  const rows: Array<{
    batchId: string;
    projectCode: string | null;
    empId: string;
    name: string;
    period: string;
    employeeShare: number;
    employerShare: number;
    ec?: number;
    rateVersion: string;
  }> = [];

  for (const b of batches) {
    for (const l of linesByBatch.get(b.id) ?? []) {
      const employeeShare = Number(agency === "sss" ? l.sss : agency === "philhealth" ? l.philhealth : l.pagibig);
      const employerShare = Number(
        agency === "sss" ? l.employerSss : agency === "philhealth" ? l.employerPhilhealth : l.employerPagibig,
      );
      rows.push({
        batchId: b.id,
        projectCode: b.projectCode,
        empId: l.empId,
        name: l.name,
        period: l.period,
        employeeShare,
        employerShare,
        ...(agency === "sss" ? { ec: Number(l.employerEc) } : {}),
        rateVersion: l.rateVersions?.[agency] ?? "",
      });
    }
  }
  return rows;
};
