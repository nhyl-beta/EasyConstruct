import { NextFunction, Request, Response } from "express";
import { formatSuccess } from "../../../core/utils/response.js";
import * as service from "./service.js";
import { cached } from "../../../core/cache/index.js";
import type { WorkforceReportFilters } from "./service.js";
import { byNumber, byString, paginateRows, parsePageRequest, sendPaged } from "../../../core/utils/pagination.js";
import type { WorkerProjectRow } from "./fairness.js";

export const getSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters: WorkforceReportFilters = {
      department: req.query.department as string,
      status: req.query.status as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
      period: req.query.period as string,
    };
    // Aggregate over employees, attendance and payroll, same for every caller. 60 s.
    const data = await cached("reports", "all", 60, () => service.getSummary(filters), {
      query: filters,
      deps: ["employees", "attendance", "payroll"],
    });
    res.json(formatSuccess(data, "Workforce summary retrieved"));
  } catch (err) {
    next(err);
  }
};


// Fix 2.6: hours, overtime and task counts per worker per project, and pay against the position median. Read-only.
export const getFairness = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    const data = await service.getFairness({
      dateFrom: str(req.query.dateFrom),
      dateTo: str(req.query.dateTo),
      projectCode: str(req.query.projectCode),
    });
    const request = parsePageRequest(req.query, { sortable: ["name", "projectCode", "hours", "overtimeHours", "tasksAssigned"] });
    if (!request.requested) {
      res.json(formatSuccess(data, "Fairness summary retrieved"));
      return;
    }
    const sorters = {
      name: byString((r: WorkerProjectRow) => r.name),
      projectCode: byString((r: WorkerProjectRow) => r.projectCode),
      hours: byNumber((r: WorkerProjectRow) => r.hours),
      overtimeHours: byNumber((r: WorkerProjectRow) => r.overtimeHours),
      tasksAssigned: byNumber((r: WorkerProjectRow) => r.tasksAssigned),
    };
    const { items, meta } = paginateRows(data.rows, request, sorters);
    sendPaged(res, items, "Fairness summary retrieved", { ...meta, positions: data.positions, flags: data.flags, basis: data.basis });
  } catch (err) {
    next(err);
  }
};
