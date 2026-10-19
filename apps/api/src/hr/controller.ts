import type { NextFunction, Request, Response } from "express";
import { HTTP } from "../constants/http-status.js";
import { formatSuccess } from "../utils/response.js";
import { ValidationError } from "../utils/errors.js";
import * as service from "./service.js";
import { byString, paginateRows, parsePageRequest, respondList } from "../utils/pagination.js";
import { cached } from "../cache/index.js";
import {
  attendanceQuerySchema,
  payrollQuerySchema,
  workforceQuerySchema,
} from "./validators.js";

function parseQuery<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, value: unknown) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(", "));
  }
  return parsed.data;
}

function parseId(value: string | string[] | undefined) {
  const normalizedValue = Array.isArray(value) ? value[0] : value;
  if (normalizedValue === undefined || normalizedValue === "") {
    throw new ValidationError("ID is required");
  }

  const id = Number(normalizedValue);
  if (!Number.isInteger(id) || id < 1) throw new ValidationError("ID must be a positive integer");
  return id;
}

export const listEmployees = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.listEmployees({
      search: req.query.search as string,
      department: req.query.department as string,
      status: req.query.status as string,
    });
    respondList(res, req.query, data, "Employees retrieved", {
      name: byString((e) => e.name),
      employeeId: byString((e) => e.employeeId),
      department: byString((e) => e.department),
      status: byString((e) => e.status),
    });
  } catch (error) { next(error); }
};

export const getEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(formatSuccess(await service.getEmployee(parseId(req.params.id)), "Employee retrieved")); }
  catch (error) { next(error); }
};

export const createEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try { res.status(HTTP.CREATED).json(formatSuccess(await service.createEmployee(req.body), "Employee created")); }
  catch (error) { next(error); }
};

export const updateEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(formatSuccess(await service.updateEmployee(parseId(req.params.id), req.body), "Employee updated")); }
  catch (error) { next(error); }
};

export const deleteEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(formatSuccess(await service.removeEmployee(parseId(req.params.id)), "Employee deleted")); }
  catch (error) { next(error); }
};

export const listAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    respondList(
      res,
      req.query,
      await service.listAttendance(parseQuery(attendanceQuerySchema, req.query)),
      "Attendance retrieved",
      {
        logDate: byString((a) => a.logDate),
        employeeId: byString((a) => a.employeeId),
        site: byString((a) => a.site),
        status: byString((a) => a.status),
      },
    );
  }
  catch (error) { next(error); }
};

export const attendanceSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = parseQuery(attendanceQuerySchema, { date: req.query.date }).date
      ?? new Date().toISOString().slice(0, 10);
    // Today's attendance counts only (no rows), same for every caller. 15 s.
    const summary = await cached("attendance", "all", 15, () => service.attendanceSummary(date), { query: { date }, deps: ["employees"] });
    res.json(formatSuccess(summary, "Attendance summary retrieved"));
  } catch (error) { next(error); }
};

export const createAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try { res.status(HTTP.CREATED).json(formatSuccess(await service.createAttendance(req.body), "Attendance recorded")); }
  catch (error) { next(error); }
};

export const updateAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(formatSuccess(await service.updateAttendance(parseId(req.params.id), req.body), "Attendance updated")); }
  catch (error) { next(error); }
};

export const deleteAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(formatSuccess(await service.removeAttendance(parseId(req.params.id)), "Attendance deleted")); }
  catch (error) { next(error); }
};

export const listPayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = parseQuery(payrollQuerySchema, req.query);
    const payroll = await service.getPayroll(query);
    const paging = parsePageRequest(req.query, { sortable: ["name", "period", "gross", "net"] });
    if (!paging.requested) {
      res.json(formatSuccess(payroll, "Payroll retrieved"));
      return;
    }
    // Totals stay the totals of the whole period; only `rows` is windowed.
    const { items, meta } = paginateRows(payroll.rows, paging, {
      name: (a, b) => a.name.localeCompare(b.name),
      period: (a, b) => a.period.localeCompare(b.period),
      gross: (a, b) => Number(a.gross) - Number(b.gross),
      net: (a, b) => Number(a.net) - Number(b.net),
    });
    res.json({ ...formatSuccess({ rows: items, totals: payroll.totals }, "Payroll retrieved"), meta });
  } catch (error) { next(error); }
};

export const tracksheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = parseQuery(payrollQuerySchema, req.query);
    res.json(formatSuccess(await service.getTracksheet(query), "Tracksheet retrieved"));
  } catch (error) { next(error); }
};

export const grossLabor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = parseQuery(payrollQuerySchema, req.query);
    res.json(formatSuccess(await service.getGrossLabor(query), "Gross labor retrieved"));
  } catch (error) { next(error); }
};

export const grossTracking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = parseQuery(payrollQuerySchema, req.query);
    res.json(formatSuccess(await service.getGrossTracking(query), "Gross tracking retrieved"));
  } catch (error) { next(error); }
};

export const workforceReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = parseQuery(workforceQuerySchema, req.query);
    // Heavy-ish aggregate over employees, attendance and payroll, same for every caller. 60 s.
    const report = await cached("reports", "all", 60, () => service.workforceReport(query.from, query.to), {
      query,
      deps: ["employees", "attendance", "payroll"],
    });
    res.json(formatSuccess(report, "Workforce report retrieved"));
  } catch (error) { next(error); }
};
