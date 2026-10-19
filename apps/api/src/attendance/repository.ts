import { and, desc, eq, gte, ilike, inArray, lte, or, sql, SQL } from "drizzle-orm";
import { employees } from "../db/schema/employees.js";
import { db } from "../db/connection.js";
import { attendance } from "../db/schema/attendance.js";
import type {
  AttendanceFilters,
  CreateAttendanceInput,
  UpdateAttendanceInput,
} from "./types.js";

const buildConditions = (filters: AttendanceFilters): SQL[] => {
  const conditions: SQL[] = [];

  if (filters.employeeId)
    conditions.push(eq(attendance.employeeId, filters.employeeId));

  if (filters.projectCode)
    conditions.push(eq(attendance.projectCode, filters.projectCode));

  if (filters.status && filters.status !== "all")
    conditions.push(eq(attendance.attendanceStatus, filters.status));

  if (filters.verification && filters.verification !== "all")
    conditions.push(eq(attendance.status, filters.verification));

  if (filters.search?.trim()) {
    const s = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(attendance.employeeId, s),
        ilike(attendance.site, s),
        inArray(
          attendance.employeeId,
          db.select({ id: employees.employeeId }).from(employees).where(ilike(employees.name, s)),
        ),
      )!,
    );
  }

  if (filters.dateFrom) conditions.push(gte(attendance.logDate, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(attendance.logDate, filters.dateTo));
  return conditions;
};

export const findAll = async (filters: AttendanceFilters = {}) => {
  const conditions = buildConditions(filters);
  return conditions.length
    ? await db.select().from(attendance).where(and(...conditions))
    : await db.select().from(attendance);
};

// E1: one page of the filtered list, newest first (id as the stable tiebreak so
// rows do not shuffle between pages), plus the count for the page controls.
export const countFiltered = async (filters: AttendanceFilters): Promise<number> => {
  const conditions = buildConditions(filters);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(attendance)
    .where(conditions.length ? and(...conditions) : undefined);
  return row?.n ?? 0;
};

export const ATTENDANCE_SORT_COLUMNS = {
  logDate: attendance.logDate,
  clockIn: attendance.clockIn,
  employeeId: attendance.employeeId,
  site: attendance.site,
  projectCode: attendance.projectCode,
  status: attendance.status,
  attendanceStatus: attendance.attendanceStatus,
  hours: attendance.hours,
} as const;

export const defaultAttendanceOrder = [desc(attendance.logDate), desc(attendance.clockIn), desc(attendance.id)];

export const findPage = async (
  filters: AttendanceFilters,
  limit: number,
  offset: number,
  orderBy: SQL[] = defaultAttendanceOrder,
) => {
  const conditions = buildConditions(filters);
  return db
    .select()
    .from(attendance)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);
};

/** Counts across the whole filtered set (not just the current page) for the KPI strip. */
export const summarize = async (filters: AttendanceFilters) => {
  const conditions = buildConditions(filters);
  const [row] = await db
    .select({
      verified: sql<number>`count(*) filter (where ${attendance.status} = 'Verified')::int`,
      pending: sql<number>`count(*) filter (where ${attendance.status} = 'Pending')::int`,
      flagged: sql<number>`count(*) filter (where ${attendance.status} = 'Flagged')::int`,
      geofenceFlags: sql<number>`count(*) filter (where ${attendance.geofence} = 'Outside')::int`,
      photoFailures: sql<number>`count(*) filter (where ${attendance.photo} = 'Failed')::int`,
      bulkVerifiable: sql<number>`count(*) filter (where ${attendance.status} = 'Pending' and ${attendance.geofence} <> 'Outside' and ${attendance.photo} <> 'Failed')::int`,
    })
    .from(attendance)
    .where(conditions.length ? and(...conditions) : undefined);
  return row ?? { verified: 0, pending: 0, flagged: 0, geofenceFlags: 0, photoFailures: 0, bulkVerifiable: 0 };
};

export const findSince = async (dateFrom: string) =>
  db
    .select({
      site: attendance.site,
      logDate: attendance.logDate,
      attendanceStatus: attendance.attendanceStatus,
      clockOut: attendance.clockOut,
      hours: attendance.hours,
    })
    .from(attendance)
    .where(gte(attendance.logDate, dateFrom));

/** Verifies every Pending record in the filtered set that has no geofence breach or failed photo. */
export const verifyCleanPending = async (filters: AttendanceFilters): Promise<number> => {
  const conditions = [
    ...buildConditions(filters),
    eq(attendance.status, "Pending"),
    sql`${attendance.geofence} <> 'Outside'`,
    sql`${attendance.photo} <> 'Failed'`,
  ];
  const updated = await db
    .update(attendance)
    .set({ status: "Verified" })
    .where(and(...conditions))
    .returning({ id: attendance.id });
  return updated.length;
};

// G5: verification status (Verified/Flagged/Pending, attendance.status) is a
// separate column from attendanceStatus (Present/Absent/…, what findAll's
// own `status` filter already reads) — payroll only wants hours HR has
// actually verified, so this is a dedicated query rather than overloading
// findAll's filter to mean two different columns.
export const findVerified = async (filters: { projectCode: string; dateFrom?: string; dateTo?: string }) => {
  const conditions: SQL[] = [
    eq(attendance.projectCode, filters.projectCode),
    eq(attendance.status, "Verified"),
  ];
  if (filters.dateFrom) conditions.push(gte(attendance.logDate, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(attendance.logDate, filters.dateTo));
  return db.select().from(attendance).where(and(...conditions));
};

// Every entry for a project in a date range, whatever its verification status
// — payroll readiness needs the unverified ones to say what is left out.
export const findForProject = async (filters: { projectCode: string; dateFrom?: string; dateTo?: string }) => {
  const conditions: SQL[] = [eq(attendance.projectCode, filters.projectCode)];
  if (filters.dateFrom) conditions.push(gte(attendance.logDate, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(attendance.logDate, filters.dateTo));
  return db.select().from(attendance).where(and(...conditions));
};

export const findById = async (id: number) => {
  const [row] = await db.select().from(attendance).where(eq(attendance.id, id));
  return row ?? null;
};

export const findByClientRequestId = async (clientRequestId: string) => {
  const [row] = await db
    .select()
    .from(attendance)
    .where(eq(attendance.clientRequestId, clientRequestId));
  return row ?? null;
};

export const create = async (data: CreateAttendanceInput & { hours?: string }) => {
  if (!data.clientRequestId) {
    const [created] = await db.insert(attendance).values(data).returning();
    return created;
  }

  // E1: a second race on the exact same clientRequestId (two sync attempts
  // in flight at once) falls back to the row the other request just created,
  // rather than erroring on the partial unique index.
  const [created] = await db
    .insert(attendance)
    .values(data)
    .onConflictDoNothing({ target: attendance.clientRequestId })
    .returning();
  if (created) return created;
  return findByClientRequestId(data.clientRequestId);
};

export const update = async (id: number, data: UpdateAttendanceInput & { hours?: string }) => {
  const [updated] = await db
    .update(attendance)
    .set(data)
    .where(eq(attendance.id, id))
    .returning();
  return updated ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db.delete(attendance).where(eq(attendance.id, id)).returning();
  return deleted ?? null;
};