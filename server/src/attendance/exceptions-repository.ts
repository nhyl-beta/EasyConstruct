// server/src/attendance/exceptions-repository.ts (objectives fix 2.3): reads for the exception rules.
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { attendance } from "../db/schema/attendance.js";
import { employees } from "../db/schema/employees.js";
import { notifications } from "../db/schema/notifications.js";
import { projectMembers } from "../db/schema/project-members.js";
import { projects } from "../db/schema/projects.js";
import { tasks } from "../db/schema/task.js";
import type { AttendanceRow, ExpectedWorker, OpenTaskDue } from "./exceptions.js";

export const findRows = async (from: string, to: string): Promise<AttendanceRow[]> => {
  const rows = await db
    .select({
      id: attendance.id,
      employeeId: attendance.employeeId,
      logDate: attendance.logDate,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      geofence: attendance.geofence,
      photo: attendance.photo,
      photoUrl: attendance.photoUrl,
      attendanceStatus: attendance.attendanceStatus,
      source: attendance.source,
      projectCode: attendance.projectCode,
    })
    .from(attendance)
    .where(and(gte(attendance.logDate, from), lte(attendance.logDate, to)));
  return rows;
};

/** Active employees staffed as site personnel on a project in Construction or Closeout (the people expected to clock in). */
export const findExpectedWorkers = async (): Promise<ExpectedWorker[]> => {
  const rows = await db
    .select({
      employeeId: employees.employeeId,
      name: employees.name,
      userId: projectMembers.userId,
      projectCode: projectMembers.projectCode,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.code, projectMembers.projectCode))
    .innerJoin(employees, eq(employees.userId, projectMembers.userId))
    .where(
      and(
        eq(projectMembers.role, "site-personnel"),
        inArray(projects.status, ["Construction", "Closeout"]),
        eq(employees.status, "Active"),
      ),
    );
  return rows;
};

export const findOpenTasksDue = async (from: string, to: string): Promise<OpenTaskDue[]> =>
  db
    .select({
      assignedToUserId: tasks.assignedToUserId,
      title: tasks.title,
      dueDate: tasks.dueDate,
      status: tasks.status,
    })
    .from(tasks)
    .where(and(isNotNull(tasks.assignedToUserId), gte(tasks.dueDate, from), lte(tasks.dueDate, to), sql`${tasks.status} <> 'Completed'`));

export const findNames = async (employeeIds: string[]): Promise<Map<string, { name: string; userId: number | null }>> => {
  const unique = [...new Set(employeeIds)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ employeeId: employees.employeeId, name: employees.name, userId: employees.userId })
    .from(employees)
    .where(inArray(employees.employeeId, unique));
  return new Map(rows.map((r) => [r.employeeId, { name: r.name, userId: r.userId }]));
};

/** True when a role-addressed notice with this title already went out at or after `since`. */
export const roleNoticeSince = async (role: string, title: string, since: Date): Promise<boolean> => {
  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.role, role), eq(notifications.title, title), gte(notifications.createdAt, since)))
    .limit(1);
  return !!row;
};
