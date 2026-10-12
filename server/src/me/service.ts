// server/src/me/service.ts (objectives fix 2.5)
//
// A person's own attendance and pay, found through the real employees.user_id
// link (the same link the clock-in and the C4 gate already rely on). Nothing is
// guessed from an email or a name: with no link there is no page content, and
// the answer says so.
import { NotFoundError } from "../utils/errors.js";
import * as repo from "./repository.js";

const requireOwnEmployee = async (userId: number) => {
  const employee = await repo.findEmployeeByUserId(userId);
  if (!employee) throw new NotFoundError("Employee record linked to your account");
  return employee;
};

export const getMyEmployee = async (userId: number) => {
  const e = await repo.findEmployeeByUserId(userId);
  if (!e) return { linked: false as const, employee: null };
  return {
    linked: true as const,
    employee: { employeeId: e.employeeId, name: e.name, position: e.role, department: e.department, status: e.status },
  };
};

export const getMyAttendance = async (userId: number, dateFrom?: string, dateTo?: string) => {
  const e = await requireOwnEmployee(userId);
  const rows = await repo.findAttendance(e.employeeId, dateFrom, dateTo);
  return rows.map((r) => ({ ...r, hours: r.hours != null ? Number(r.hours) : null }));
};

export const getMyPayslips = async (userId: number) => {
  const e = await requireOwnEmployee(userId);
  const rows = await repo.findApprovedPayslips(e.employeeId);
  return rows.map((r) => ({
    ...r,
    hours: Number(r.hours),
    overtime: Number(r.overtime),
    adjustments: Number(r.adjustments),
    gross: Number(r.gross),
    sss: Number(r.sss),
    philhealth: Number(r.philhealth),
    pagibig: Number(r.pagibig),
    deductions: Number(r.deductions),
    net: Number(r.net),
  }));
};
