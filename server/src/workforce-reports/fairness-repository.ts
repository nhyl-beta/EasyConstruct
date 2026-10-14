// server/src/workforce-reports/fairness-repository.ts (objectives fix 2.6): aggregates in the database, nothing row by row.
import { and, eq, gte, isNotNull, lte, sql, SQL } from "drizzle-orm";
import { db } from "../db/connection.js";
import { attendance } from "../db/schema/attendance.js";
import { employees } from "../db/schema/employees.js";
import { tasks } from "../db/schema/task.js";
import type { WorkerProjectRow, WorkerRate } from "./fairness.js";

export interface FairnessFilters {
  dateFrom?: string;
  dateTo?: string;
  projectCode?: string;
}

const HOURS_PER_DAY = 8;

export const loadFairnessData = async (
  filters: FairnessFilters,
): Promise<{ rows: WorkerProjectRow[]; rates: WorkerRate[] }> => {
  const attendanceWhere: SQL[] = [isNotNull(attendance.projectCode)];
  if (filters.dateFrom) attendanceWhere.push(gte(attendance.logDate, filters.dateFrom));
  if (filters.dateTo) attendanceWhere.push(lte(attendance.logDate, filters.dateTo));
  if (filters.projectCode) attendanceWhere.push(eq(attendance.projectCode, filters.projectCode));

  const taskWhere: SQL[] = [isNotNull(tasks.assignedToUserId)];
  if (filters.dateFrom) taskWhere.push(gte(tasks.dueDate, filters.dateFrom));
  if (filters.dateTo) taskWhere.push(lte(tasks.dueDate, filters.dateTo));
  if (filters.projectCode) taskWhere.push(eq(tasks.projectCode, filters.projectCode));

  const [attendanceRows, taskRows, people] = await Promise.all([
    db
      .select({
        employeeId: attendance.employeeId,
        projectCode: attendance.projectCode,
        days: sql<number>`count(distinct ${attendance.logDate}) filter (where ${attendance.attendanceStatus} in ('Present', 'Late', 'Half Day'))::int`,
        hours: sql<string>`coalesce(sum(${attendance.hours}), 0)`,
        overtime: sql<string>`coalesce(sum(greatest(${attendance.hours} - ${HOURS_PER_DAY}, 0)), 0)`,
      })
      .from(attendance)
      .where(and(...attendanceWhere))
      .groupBy(attendance.employeeId, attendance.projectCode),
    db
      .select({
        employeeId: employees.employeeId,
        projectCode: tasks.projectCode,
        assigned: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${tasks.status} = 'Completed')::int`,
        open: sql<number>`count(*) filter (where ${tasks.status} <> 'Completed')::int`,
      })
      .from(tasks)
      .innerJoin(employees, eq(employees.userId, tasks.assignedToUserId))
      .where(and(...taskWhere))
      .groupBy(employees.employeeId, tasks.projectCode),
    db
      .select({
        employeeId: employees.employeeId,
        name: employees.name,
        position: employees.role,
        rateType: employees.rateType,
        payRate: employees.payRate,
      })
      .from(employees)
      .where(eq(employees.status, "Active")),
  ]);

  const byId = new Map(people.map((p) => [p.employeeId, p]));
  const merged = new Map<string, WorkerProjectRow>();
  const get = (employeeId: string, projectCode: string): WorkerProjectRow | null => {
    const person = byId.get(employeeId);
    // Not Active (or removed): left out of a fairness view of current staff.
    if (!person) return null;
    const key = `${employeeId}|${projectCode}`;
    let row = merged.get(key);
    if (!row) {
      row = {
        employeeId,
        name: person.name,
        position: person.position,
        projectCode,
        days: 0,
        hours: 0,
        overtimeHours: 0,
        tasksAssigned: 0,
        tasksCompleted: 0,
        tasksOpen: 0,
      };
      merged.set(key, row);
    }
    return row;
  };

  for (const a of attendanceRows) {
    const row = a.projectCode ? get(a.employeeId, a.projectCode) : null;
    if (!row) continue;
    row.days = a.days;
    row.hours = Number(a.hours);
    row.overtimeHours = Number(a.overtime);
  }
  for (const t of taskRows) {
    const row = get(t.employeeId, t.projectCode);
    if (!row) continue;
    row.tasksAssigned = t.assigned;
    row.tasksCompleted = t.completed;
    row.tasksOpen = t.open;
  }

  return {
    rows: [...merged.values()],
    rates: people.map((p) => ({
      employeeId: p.employeeId,
      name: p.name,
      position: p.position,
      rateType: p.rateType,
      payRate: Number(p.payRate),
    })),
  };
};
