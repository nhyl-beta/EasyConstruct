import { and, eq, gte, lte, sql, SQL } from "drizzle-orm";
import { db } from "../../../core/db/connection.js";
import { attendance } from "../../../core/db/schema/attendance.js";
import { employees } from "../../../core/db/schema/employees.js";
import { payroll } from "../../../core/db/schema/payroll.js";
import { loadFairnessData, type FairnessFilters } from "./fairness-repository.js";
import { summarizeFairness } from "./fairness.js";

export interface WorkforceReportFilters {
  department?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  period?: string; // payroll period label, for the payroll summary section
}

// Every figure is a COUNT / SUM / GROUP BY in the database; the previous
// version loaded all employees, all attendance rows in range and all payroll
// lines and counted them here. Same filters, same output shape.
export const getSummary = async (filters: WorkforceReportFilters) => {
  const employeeConditions: SQL[] = [];
  if (filters.department && filters.department !== "all")
    employeeConditions.push(eq(employees.department, filters.department));
  if (filters.status && filters.status !== "all")
    employeeConditions.push(eq(employees.status, filters.status));
  const employeeWhere = employeeConditions.length ? and(...employeeConditions) : undefined;

  const attendanceConditions: SQL[] = [];
  if (filters.dateFrom) attendanceConditions.push(gte(attendance.logDate, filters.dateFrom));
  if (filters.dateTo) attendanceConditions.push(lte(attendance.logDate, filters.dateTo));
  const attendanceWhere = attendanceConditions.length ? and(...attendanceConditions) : undefined;

  const [employeeTotals, byDepartmentRows, byPositionRows, attendanceRows, payrollTotals] =
    await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`(count(*) filter (where ${employees.status} = 'Active'))::int`,
        })
        .from(employees)
        .where(employeeWhere),
      db
        .select({ key: employees.department, n: sql<number>`count(*)::int` })
        .from(employees)
        .where(employeeWhere)
        .groupBy(employees.department),
      db
        .select({ key: employees.role, n: sql<number>`count(*)::int` })
        .from(employees)
        .where(employeeWhere)
        .groupBy(employees.role),
      db
        .select({
          status: attendance.attendanceStatus,
          n: sql<number>`count(*)::int`,
          hours: sql<string>`coalesce(sum(${attendance.hours}), 0)`,
        })
        .from(attendance)
        .where(attendanceWhere)
        .groupBy(attendance.attendanceStatus),
      db
        .select({
          lines: sql<number>`count(*)::int`,
          gross: sql<string>`coalesce(sum(${payroll.gross}), 0)`,
          net: sql<string>`coalesce(sum(${payroll.net}), 0)`,
        })
        .from(payroll)
        .where(filters.period ? eq(payroll.period, filters.period) : undefined),
    ]);

  const totalEmployees = employeeTotals[0]?.total ?? 0;
  const activeEmployees = employeeTotals[0]?.active ?? 0;

  const toRecord = (rows: { key: string; n: number }[]) =>
    Object.fromEntries(rows.map((r) => [r.key, r.n])) as Record<string, number>;

  const attendanceByStatus: Record<string, number> = {};
  let totalRecords = 0;
  let totalHours = 0;
  for (const row of attendanceRows) {
    attendanceByStatus[row.status] = row.n;
    totalRecords += row.n;
    totalHours += Number(row.hours);
  }

  const lineCount = payrollTotals[0]?.lines ?? 0;
  const totalGrossLabor = Number(payrollTotals[0]?.gross ?? 0);
  const totalNetPay = Number(payrollTotals[0]?.net ?? 0);

  return {
    totalEmployees,
    activeEmployees,
    inactiveEmployees: totalEmployees - activeEmployees,
    employeesByDepartment: toRecord(byDepartmentRows),
    employeesByPosition: toRecord(byPositionRows),
    attendanceSummary: {
      totalRecords,
      byStatus: attendanceByStatus,
      totalHoursWorked: Number(totalHours.toFixed(1)),
    },
    payrollSummary: {
      lineCount,
      totalGrossLabor: Number(totalGrossLabor.toFixed(2)),
      totalNetPay: Number(totalNetPay.toFixed(2)),
    },
  };
};


// Fairness (objectives fix 2.6): read-only.

export const getFairness = async (filters: FairnessFilters) => {
  const { rows, rates } = await loadFairnessData(filters);
  const { positions, flags } = summarizeFairness(rows, rates);
  return {
    rows: rows.sort((a, b) => a.projectCode.localeCompare(b.projectCode) || b.hours - a.hours || a.name.localeCompare(b.name)),
    positions,
    flags,
    basis:
      "Hours, overtime (beyond 8 hours a day) and tasks are totals per worker per project. Pay rates are compared with the median of the same position and rate type. Flags are for HR to look at; nothing is changed.",
  };
};
