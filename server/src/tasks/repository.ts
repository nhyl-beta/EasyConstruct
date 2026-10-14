// server/src/tasks/repository.ts — NEW
import { and, desc, eq, gte, inArray, isNull, sql, SQL } from "drizzle-orm";
import { db } from "../db/connection.js";
import { tasks } from "../db/schema/task.js";
import { projectMembers } from "../db/schema/project-members.js";
import { employees } from "../db/schema/employees.js";
import { attendance } from "../db/schema/attendance.js";
import type { AllocationCandidate } from "./suggest.js";
import { countRows, inCodes, selectPage } from "../db/paged.js";
import type { CreateTaskInput, TaskFilters, UpdateTaskInput } from "./types.js";

const buildConditions = (filters: TaskFilters): SQL[] => {
  const conditions: SQL[] = [];
  if (filters.codes) conditions.push(inCodes(tasks.projectCode, filters.codes));
  if (filters.projectCode) conditions.push(eq(tasks.projectCode, filters.projectCode));
  if (filters.status && filters.status !== "all") conditions.push(eq(tasks.status, filters.status));
  if (filters.assignedToUserId) conditions.push(eq(tasks.assignedToUserId, filters.assignedToUserId));
  return conditions;
};

/** Per-project rollup of task statuses and progress (the engineer's progress card). */
export const progressByProject = async (filters: TaskFilters = {}) => {
  const conditions = buildConditions({ ...filters, status: undefined });
  const rows = await db
    .select({
      projectCode: tasks.projectCode,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'Completed')::int`,
      inProgress: sql<number>`count(*) filter (where ${tasks.status} = 'In Progress')::int`,
      pending: sql<number>`count(*) filter (where ${tasks.status} = 'Pending')::int`,
      progressSum: sql<number>`coalesce(sum(${tasks.progress}), 0)::int`,
    })
    .from(tasks)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(tasks.projectCode)
    .orderBy(tasks.projectCode);
  return rows.map((r) => ({
    projectCode: r.projectCode,
    total: r.total,
    completed: r.completed,
    inProgress: r.inProgress,
    pending: r.pending,
    percentComplete: r.total ? Math.round(r.progressSum / r.total) : 0,
  }));
};

export const TASK_SORT_COLUMNS = {
  id: tasks.id,
  title: tasks.title,
  status: tasks.status,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
  projectCode: tasks.projectCode,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
} as const;

export const defaultTaskOrder = [desc(tasks.id)];

export const countFiltered = async (filters: TaskFilters = {}) => {
  const conditions = buildConditions(filters);
  return countRows(tasks, conditions.length ? and(...conditions) : undefined);
};

export const findPage = async (filters: TaskFilters, window: { limit: number; offset: number }, orderBy: SQL[]) => {
  const conditions = buildConditions(filters);
  return selectPage(tasks, conditions.length ? and(...conditions) : undefined, orderBy, window);
};

export const findAll = async (filters: TaskFilters = {}) => {
  const conditions = buildConditions(filters);

  // Newest first, and applied here (not client-side) so it survives refetch.
  return conditions.length
    ? await db.select().from(tasks).where(and(...conditions)).orderBy(desc(tasks.id))
    : await db.select().from(tasks).orderBy(desc(tasks.id));
};

export const findById = async (id: number) => {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
  return row ?? null;
};

/** Several tasks in one query, keyed by id. */
export const findByIds = async (ids: number[]) => {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<number, typeof tasks.$inferSelect>();
  const rows = await db.select().from(tasks).where(inArray(tasks.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
};

export const create = async (data: CreateTaskInput) => {
  const [created] = await db.insert(tasks).values(data).returning();
  return created;
};

export const update = async (id: number, data: UpdateTaskInput) => {
  const [updated] = await db
    .update(tasks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning();
  return updated ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
  return deleted ?? null;
};

// ── Allocation data (fix 2.1 / 2.2) ───────────────────────────────────────

/**
 * Everything the allocation rules need for the Site Personnel staffed on a
 * project, in four queries: members, their employee records (employees.userId
 * is the login link), their open tasks across all projects, and attendance for
 * the trailing window. `unlinked` are staffed users with no employee record.
 */
export const loadAllocationData = async (projectCode: string, today: string, windowStart: string) => {
  const members = await db
    .select({ userId: projectMembers.userId, userName: projectMembers.userName })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectCode, projectCode), eq(projectMembers.role, "site-personnel")));
  return loadAllocationDataForUsers(members, today, windowStart);
};

export const loadAllocationDataForUsers = async (
  members: { userId: number; userName: string }[],
  today: string,
  windowStart: string,
): Promise<{ candidates: AllocationCandidate[]; unlinked: { userId: number; name: string }[] }> => {
  const userIds = [...new Set(members.map((m) => m.userId))];
  if (userIds.length === 0) return { candidates: [], unlinked: [] };

  const emps = await db.select().from(employees).where(inArray(employees.userId, userIds));
  const empByUser = new Map(emps.map((e) => [e.userId as number, e]));
  const employeeIds = emps.map((e) => e.employeeId);

  const [openRows, attendanceRows] = await Promise.all([
    db
      .select({ id: tasks.id, userId: tasks.assignedToUserId, dueDate: tasks.dueDate })
      .from(tasks)
      .where(and(inArray(tasks.assignedToUserId, userIds), sql`${tasks.status} <> 'Completed'`)),
    employeeIds.length
      ? db
          .select({ employeeId: attendance.employeeId, logDate: attendance.logDate, status: attendance.attendanceStatus })
          .from(attendance)
          .where(and(inArray(attendance.employeeId, employeeIds), gte(attendance.logDate, windowStart)))
      : Promise.resolve([] as { employeeId: string; logDate: string; status: string }[]),
  ]);

  const openByUser = new Map<number, { id: number; dueDate: string | null }[]>();
  for (const r of openRows) {
    if (r.userId == null) continue;
    const list = openByUser.get(r.userId) ?? [];
    list.push({ id: r.id, dueDate: r.dueDate });
    openByUser.set(r.userId, list);
  }
  const attByEmp = new Map<string, { logDate: string; status: string }[]>();
  for (const r of attendanceRows) {
    const list = attByEmp.get(r.employeeId) ?? [];
    list.push({ logDate: r.logDate, status: r.status });
    attByEmp.set(r.employeeId, list);
  }

  const candidates: AllocationCandidate[] = [];
  const unlinked: { userId: number; name: string }[] = [];
  for (const m of members) {
    const e = empByUser.get(m.userId);
    if (!e) {
      unlinked.push({ userId: m.userId, name: m.userName });
      continue;
    }
    const rows = attByEmp.get(e.employeeId) ?? [];
    const presentDays = new Set(rows.filter((r) => ["Present", "Late", "Half Day"].includes(r.status)).map((r) => r.logDate));
    const todayRows = rows.filter((r) => r.logDate === today);
    candidates.push({
      userId: m.userId,
      name: e.name,
      employeeId: e.employeeId,
      position: e.role,
      employeeStatus: e.status,
      openTasks: openByUser.get(m.userId) ?? [],
      attendanceDays: presentDays.size,
      onLeaveToday: todayRows.some((r) => r.status === "On Leave"),
      absentToday: todayRows.some((r) => r.status === "Absent"),
    });
  }
  return { candidates, unlinked };
};

/** Unassigned, not-completed tasks on a project (for the batch suggestion). */
export const findUnassigned = async (projectCode: string) =>
  db
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectCode, projectCode), isNull(tasks.assignedToUserId), sql`${tasks.status} <> 'Completed'`))
    .orderBy(tasks.id);
