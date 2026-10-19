import { and, desc, eq, gte, ilike, lte, or, SQL } from "drizzle-orm";
import { db } from "../db/connection.js";
import { attendance, employees, payroll } from "../db/schema/index.js";

export async function findEmployees(filters: {
  search?: string;
  department?: string;
  status?: string;
}) {
  const conditions: SQL[] = [];
  if (filters.department && filters.department !== "all") {
    conditions.push(eq(employees.department, filters.department));
  }
  if (filters.status && filters.status !== "all") {
    conditions.push(eq(employees.status, filters.status));
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(employees.name, term),
        ilike(employees.employeeId, term),
        ilike(employees.role, term),
        ilike(employees.department, term),
      )!,
    );
  }
  return conditions.length
    ? db.select().from(employees).where(and(...conditions)).orderBy(employees.name)
    : db.select().from(employees).orderBy(employees.name);
}

export async function findEmployee(id: number) {
  const [employee] = await db.select().from(employees).where(eq(employees.id, id));
  return employee ?? null;
}

export async function findEmployeeByEmployeeId(employeeId: string) {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.employeeId, employeeId));
  return employee ?? null;
}

export async function insertEmployee(data: typeof employees.$inferInsert) {
  const [created] = await db.insert(employees).values(data).returning();
  return created;
}

export async function updateEmployee(
  id: number,
  data: Partial<typeof employees.$inferInsert>,
) {
  const [updated] = await db
    .update(employees)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(employees.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteEmployee(id: number) {
  const [deleted] = await db.delete(employees).where(eq(employees.id, id)).returning();
  return deleted ?? null;
}

export async function findAttendance(filters: {
  date?: string;
  from?: string;
  to?: string;
  employeeId?: string;
  site?: string;
  status?: string;
}) {
  const conditions: SQL[] = [];
  if (filters.date) conditions.push(eq(attendance.logDate, filters.date));
  if (filters.from) conditions.push(gte(attendance.logDate, filters.from));
  if (filters.to) conditions.push(lte(attendance.logDate, filters.to));
  if (filters.employeeId) conditions.push(eq(attendance.employeeId, filters.employeeId));
  if (filters.site) conditions.push(eq(attendance.site, filters.site));
  if (filters.status) conditions.push(eq(attendance.status, filters.status));
  const query = db.select().from(attendance);
  return conditions.length
    ? query.where(and(...conditions)).orderBy(desc(attendance.logDate), desc(attendance.id))
    : query.orderBy(desc(attendance.logDate), desc(attendance.id));
}

export async function findAttendanceById(id: number) {
  const [record] = await db.select().from(attendance).where(eq(attendance.id, id));
  return record ?? null;
}

export async function insertAttendance(data: typeof attendance.$inferInsert) {
  const [created] = await db.insert(attendance).values(data).returning();
  return created;
}

export async function updateAttendance(
  id: number,
  data: Partial<typeof attendance.$inferInsert>,
) {
  const [updated] = await db.update(attendance).set(data).where(eq(attendance.id, id)).returning();
  return updated ?? null;
}

export async function deleteAttendance(id: number) {
  const [deleted] = await db.delete(attendance).where(eq(attendance.id, id)).returning();
  return deleted ?? null;
}

export async function findPayroll(period?: string) {
  return period
    ? db.select().from(payroll).where(eq(payroll.period, period)).orderBy(payroll.name)
    : db.select().from(payroll).orderBy(desc(payroll.createdAt), payroll.name);
}

