import { and, eq, ilike, inArray, or, SQL } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { employees } from "../../../core/db/schema/employees.js";
import { countRows, selectPage } from "../../../core/db/paged.js";

import type {
  CreateEmployeeInput,
  EmployeeFilters,
  UpdateEmployeeInput,
} from "./types.js";

const buildConditions = (filters: EmployeeFilters): SQL[] => {
  const conditions: SQL[] = [];

  if (filters.department && filters.department !== "all") {
    conditions.push(eq(employees.department, filters.department));
  }

  if (filters.status && filters.status !== "all") {
    conditions.push(eq(employees.status, filters.status));
  }

  if (filters.employeeId) {
    conditions.push(eq(employees.employeeId, filters.employeeId));
  }

  if (filters.search) {
    const search = `%${filters.search}%`;

    const searchCondition = or(
      ilike(employees.name, search),
      ilike(employees.employeeId, search),
      ilike(employees.role, search),
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  return conditions;
};

export const findAll = async (
  filters: EmployeeFilters = {},
) => {
  const conditions = buildConditions(filters);

  if (conditions.length > 0) {
    return await db
      .select()
      .from(employees)
      .where(and(...conditions));
  }

  return await db.select().from(employees);
};

export const EMPLOYEE_SORT_COLUMNS = {
  name: employees.name,
  employeeId: employees.employeeId,
  role: employees.role,
  department: employees.department,
  site: employees.site,
  status: employees.status,
  hiredOn: employees.hiredOn,
  createdAt: employees.createdAt,
} as const;

export const defaultEmployeeOrder = [employees.name, employees.id];

export const countFiltered = async (filters: EmployeeFilters = {}) => {
  const conditions = buildConditions(filters);
  return countRows(employees, conditions.length ? and(...conditions) : undefined);
};

export const findPage = async (
  filters: EmployeeFilters,
  window: { limit: number; offset: number },
  orderBy: SQL[],
) => {
  const conditions = buildConditions(filters);
  return selectPage(employees, conditions.length ? and(...conditions) : undefined, orderBy, window);
};

export const findById = async (id: number) => {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, id));

  return employee ?? null;
};

export const findByUserId = async (userId: number) => {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, userId));

  return employee ?? null;
};

export const findByEmployeeId = async (
  employeeId: string,
) => {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.employeeId, employeeId));

  return employee ?? null;
};

/**
 * Several employees by their human code in ONE query (replaces a
 * findByEmployeeId call per row). Unknown ids are simply absent from the map.
 */
/** Pay rates of every Active employee, for comparing people in the same position (payroll warnings). */
export const findActivePayRates = async () =>
  db
    .select({ role: employees.role, rateType: employees.rateType, payRate: employees.payRate })
    .from(employees)
    .where(eq(employees.status, "Active"));

export const findByEmployeeIds = async (employeeIds: string[]) => {
  const unique = [...new Set(employeeIds)];
  const byId = new Map<string, typeof employees.$inferSelect>();
  if (unique.length === 0) return byId;
  const rows = await db.select().from(employees).where(inArray(employees.employeeId, unique));
  for (const row of rows) byId.set(row.employeeId, row);
  return byId;
};

export const findByEmail = async (email: string) => {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.email, email));

  return employee ?? null;
};

export const create = async (
  data: CreateEmployeeInput & {
    initials: string;
  },
) => {
  const [created] = await db
    .insert(employees)
    .values({
      ...data,
      payRate:
        data.payRate !== undefined
          ? String(data.payRate)
          : undefined,
    })
    .returning();

  return created ?? null;
};

export const update = async (
  id: number,
  data: UpdateEmployeeInput & {
    initials?: string;
  },
) => {
  const [updated] = await db
    .update(employees)
    .set({
      ...data,
      payRate:
        data.payRate !== undefined
          ? String(data.payRate)
          : undefined,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, id))
    .returning();

  return updated ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db
    .delete(employees)
    .where(eq(employees.id, id))
    .returning();

  return deleted ?? null;
};
