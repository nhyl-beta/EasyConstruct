import { NextFunction, Request, Response } from "express";
import { HTTP } from "../constants/http-status.js";
import { MSG } from "../constants/messages.js";
import { formatSuccess } from "../utils/response.js";
import { logAudit } from "../utils/audit.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { ValidationError } from "../utils/errors.js";
import * as service from "./service.js";
import * as ownerSummaryService from "./owner-summary.service.js";
import type { PayrollFilters } from "./types.js";
import { byDate, byString, parsePageRequest, respondList, sendPaged } from "../utils/pagination.js";
import { PAYROLL_SORT_COLUMNS } from "./repository.js";
import { cached } from "../cache/index.js";
import { parseIdParam } from "../utils/params.js";

const actorOf = (req: AuthedRequest): service.Actor => ({
  name: req.authUser?.name ?? "unknown",
  role: req.authUser?.role ?? "",
});

const idParam = (req: Request) => String(req.params.id);

// ── Tracksheet (per-employee lines) ─────────────────────────────────────────

export const getAll = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filters: PayrollFilters = {
      period: req.query.period as string,
      status: req.query.status as string,
      empId: req.query.empId as string,
      batchId: req.query.batchId as string,
    };
    const paging = parsePageRequest(req.query, { sortable: Object.keys(PAYROLL_SORT_COLUMNS) });
    if (paging.requested) {
      const { items, meta } = await service.getPage(filters, paging, actorOf(req), req.query.totals === "1");
      sendPaged(res, items, MSG.payroll.retrieved, meta);
      return;
    }
    const data = await service.getAll(filters, actorOf(req));
    res.json(formatSuccess(data, MSG.payroll.retrieved));
  } catch (err) {
    next(err);
  }
};

// Fix 2.8: the rules the engine applies right now, including the values nobody has verified yet.
export const getRulesSummary = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(formatSuccess(service.getRulesSummary(), "Payroll rules"));
  } catch (err) {
    next(err);
  }
};

export const getById = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.getById(parseIdParam(req.params.id, "id"), actorOf(req));
    res.json(formatSuccess(data, MSG.payroll.single));
  } catch (err) {
    next(err);
  }
};

// Fix 2.5: the calculation trace for one line (HR, Finance, Admin).
export const getLineTrace = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(formatSuccess(await service.getLineTrace(parseIdParam(req.params.id, "id"), actorOf(req)), "Calculation trace"));
  } catch (err) {
    next(err);
  }
};

export const update = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.update(parseIdParam(req.params.id, "id"), req.body);
    await logAudit({
      entityType: "payroll_batch",
      entityId: data.batchId ?? String(data.id),
      action: "line_updated",
      actor: actorOf(req).name,
      summary: `Recomputed payroll line for ${data.empId}`,
    });
    res.json(formatSuccess(data, MSG.payroll.updated));
  } catch (err) {
    next(err);
  }
};

export const remove = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.remove(parseIdParam(req.params.id, "id"));
    res.json(formatSuccess(data, MSG.payroll.deleted));
  } catch (err) {
    next(err);
  }
};

// G5: verified-attendance prefill for the Generate form.
export const getAttendanceSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectCode = req.query.projectCode as string;
    if (!projectCode) throw new ValidationError("projectCode is required");
    const data = await service.getAttendanceSummary(
      projectCode,
      req.query.dateFrom as string | undefined,
      req.query.dateTo as string | undefined,
    );
    res.json(formatSuccess(data, "Attendance summary retrieved"));
  } catch (err) {
    next(err);
  }
};

export const getAttendanceReadiness = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectCode = req.query.projectCode as string;
    if (!projectCode) throw new ValidationError("projectCode is required");
    const data = await service.getAttendanceReadiness(
      projectCode,
      req.query.dateFrom as string | undefined,
      req.query.dateTo as string | undefined,
    );
    res.json(formatSuccess(data, "Attendance readiness retrieved"));
  } catch (err) {
    next(err);
  }
};

// ── Generate (draft batch with server-computed lines) ───────────────────────

export const generate = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.generate(req.body, actorOf(req));
    await logAudit({
      entityType: "payroll_batch",
      entityId: data.batch.id,
      action: "created",
      actor: actorOf(req).name,
      summary: `Generated payroll for ${data.batch.period} (${data.lines.length} employees)`,
      projectCode: data.batch.projectCode ?? undefined,
    });
    res.status(HTTP.CREATED).json(formatSuccess(data, "Payroll generated"));
  } catch (err) {
    next(err);
  }
};

// ── Batches ─────────────────────────────────────────────────────────────────

export const listBatches = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.listBatches(actorOf(req));
    respondList(res, req.query, data, MSG.payrollBatches.retrieved, {
      createdAt: byDate((b) => b.createdAt),
      period: byString((b) => b.period),
      status: byString((b) => b.status),
      projectCode: byString((b) => b.projectCode),
    });
  } catch (err) {
    next(err);
  }
};

export const getBatch = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.getBatchDetail(idParam(req), actorOf(req));
    res.json(formatSuccess(data, MSG.payrollBatches.single));
  } catch (err) {
    next(err);
  }
};

export const getBatchValidation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(formatSuccess(await service.getBatchValidation(idParam(req)), "Validation complete"));
  } catch (err) {
    next(err);
  }
};

export const addLine = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.addLine(idParam(req), req.body);
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.payroll.created));
  } catch (err) {
    next(err);
  }
};

export const submitBatch = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.submitBatch(idParam(req), req.body, actorOf(req));
    await logAudit({
      entityType: "payroll_batch",
      entityId: data.id,
      action: "submitted",
      actor: actorOf(req).name,
      summary: `Payroll batch ${data.id} submitted to Finance (round ${data.round})`,
      projectCode: data.projectCode ?? undefined,
    });
    res.json(formatSuccess(data, "Payroll batch submitted to Finance"));
  } catch (err) {
    next(err);
  }
};

export const removeBatch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(formatSuccess(await service.removeBatch(idParam(req)), MSG.payrollBatches.deleted));
  } catch (err) {
    next(err);
  }
};

// ── Contribution reports ────────────────────────────────────────────────────

export const contributionReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agency = req.query.agency;
    const period = req.query.period as string | undefined;
    if (!service.isAgency(agency))
      throw new ValidationError("agency must be sss, philhealth or pagibig");
    if (!period) throw new ValidationError("period is required");
    res.json(formatSuccess(await service.contributionReport(agency, period), "Contribution report"));
  } catch (err) {
    next(err);
  }
};

// Owner dashboard: aggregate-only payroll summary (no employee data). Viewing
// is deliberately not audit-logged.
export const getOwnerSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Payroll aggregates for the owner dashboard (no individual pay data), same
    // for the three roles allowed here. 30 s; payroll writes invalidate it.
    const data = await cached("payroll", "all", 30, () => ownerSummaryService.getOwnerSummary(req.query.months), {
      query: { months: req.query.months },
    });
    res.json(formatSuccess(data, "Payroll summary retrieved"));
  } catch (err) {
    next(err);
  }
};
