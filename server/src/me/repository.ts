// server/src/me/repository.ts (objectives fix 2.5): a signed-in person's own records, found through employees.user_id.
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/connection.js";
import { attendance } from "../db/schema/attendance.js";
import { payrollBatches } from "../db/schema/finance.js";
import { payroll } from "../db/schema/payroll.js";

export { findByUserId as findEmployeeByUserId } from "../employees/repository.js";

export const findAttendance = async (employeeId: string, dateFrom?: string, dateTo?: string) => {
  const conditions = [eq(attendance.employeeId, employeeId)];
  if (dateFrom) conditions.push(gte(attendance.logDate, dateFrom));
  if (dateTo) conditions.push(lte(attendance.logDate, dateTo));
  return db
    .select({
      id: attendance.id,
      logDate: attendance.logDate,
      site: attendance.site,
      projectCode: attendance.projectCode,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      hours: attendance.hours,
      attendanceStatus: attendance.attendanceStatus,
      verification: attendance.status,
      remarks: attendance.remarks,
    })
    .from(attendance)
    .where(and(...conditions))
    .orderBy(desc(attendance.logDate), desc(attendance.id));
};

/** The person's payroll lines in APPROVED batches only; drafts, pending and returned batches are never shown. */
export const findApprovedPayslips = async (employeeId: string) =>
  db
    .select({
      id: payroll.id,
      batchId: payroll.batchId,
      period: payroll.period,
      projectCode: payrollBatches.projectCode,
      approvedAt: payrollBatches.reviewedAt,
      hours: payroll.hours,
      overtime: payroll.overtime,
      adjustments: payroll.adjustments,
      gross: payroll.gross,
      sss: payroll.sss,
      philhealth: payroll.philhealth,
      pagibig: payroll.pagibig,
      deductions: payroll.deductions,
      net: payroll.net,
      rateVersions: payroll.rateVersions,
    })
    .from(payroll)
    .innerJoin(payrollBatches, eq(payrollBatches.id, payroll.batchId))
    .where(and(eq(payroll.empId, employeeId), eq(payrollBatches.status, "approved")))
    .orderBy(desc(payrollBatches.createdAt), desc(payroll.id));
