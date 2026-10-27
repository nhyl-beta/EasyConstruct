import { db } from "../../../core/db/connection.js";
import { users } from "../../../core/db/schema/users.js";
import { employees } from "../../../core/db/schema/employees.js";
import { and, asc, eq, ilike, isNull, isNotNull, or, SQL } from "drizzle-orm";
import { countRows } from "../../../core/db/paged.js";
import { ConflictError } from "../../../core/utils/errors.js";
import type { NewAccountRow, UpdateUserInput, UserFilters } from "./types.js";

// Never select `password`. This module serves two callers: the read-only,
// non-sensitive user picker (name/email/role) used for cross-role assignment
// UI (PM picker, engineer staffing), and IT Designer's account-management
// screen, which writes here but still never reads a hash back out.
const PUBLIC_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  isActive: users.isActive,
};

export const findAll = async (filters: UserFilters = {}) => {
  return filters.role
    ? await db.select(PUBLIC_COLUMNS).from(users).where(eq(users.role, filters.role))
    : await db.select(PUBLIC_COLUMNS).from(users);
};

const userConditions = (filters: UserFilters): SQL[] => {
  const conditions: SQL[] = [];
  if (filters.role) conditions.push(eq(users.role, filters.role));
  if (filters.search) {
    const s = `%${filters.search}%`;
    conditions.push(or(ilike(users.name, s), ilike(users.email, s), ilike(users.role, s))!);
  }
  return conditions;
};

export const USER_SORT_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
} as const;

export const defaultUserOrder = [asc(users.id)];

export const countFiltered = async (filters: UserFilters = {}) => {
  const conditions = userConditions(filters);
  return countRows(users, conditions.length ? and(...conditions) : undefined);
};

/** One page of PUBLIC columns only (the password hash is never selected). */
export const findPage = async (filters: UserFilters, window: { limit: number; offset: number }, orderBy: SQL[]) => {
  const conditions = userConditions(filters);
  return db
    .select({
      ...PUBLIC_COLUMNS,
      employeeCode: employees.employeeId,
      employeeStatus: employees.status,
      employeeName: employees.name,
    })
    .from(users)
    .leftJoin(employees, eq(employees.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...orderBy)
    .limit(window.limit)
    .offset(window.offset);
};

export const findById = async (id: number) => {
  const [user] = await db.select(PUBLIC_COLUMNS).from(users).where(eq(users.id, id));
  return user ?? null;
};

export const findByEmail = async (email: string) => {
  const [user] = await db.select(PUBLIC_COLUMNS).from(users).where(eq(users.email, email));
  return user ?? null;
};

export const findEmployeeById = async (id: number) => {
  const [employee] = await db.select().from(employees).where(eq(employees.id, id));
  return employee ?? null;
};

export const findEmployeeByUserId = async (userId: number) => {
  const [employee] = await db.select().from(employees).where(eq(employees.userId, userId));
  return employee ?? null;
};

/**
 * Creates the account AND sets employees.user_id in ONE transaction. The UPDATE only matches an employee that still
 * has no account, so two requests racing for the same employee cannot both win (the partial unique index
 * employees_user_id_uq is the second guard): the loser rolls the new user back.
 */
export const createLinkedToEmployee = async (data: NewAccountRow, employeeId: number) =>
  db.transaction(async (tx) => {
    const [created] = await tx.insert(users).values(data).returning(PUBLIC_COLUMNS);
    if (!created) return null;
    const linked = await tx
      .update(employees)
      .set({ userId: created.id, updatedAt: new Date() })
      .where(and(eq(employees.id, employeeId), isNull(employees.userId)))
      .returning({ id: employees.id });
    if (linked.length === 0) throw new ConflictError("That employee already has an account");
    return created;
  });

/** Links an existing account to an employee that has none (same one-to-one guard as above). */
export const linkEmployee = async (userId: number, employeeId: number) => {
  const linked = await db
    .update(employees)
    .set({ userId, updatedAt: new Date() })
    .where(and(eq(employees.id, employeeId), isNull(employees.userId)))
    .returning();
  return linked[0] ?? null;
};

export const createEmployeeForUser = async (row: typeof employees.$inferInsert) => {
  const [created] = await db.insert(employees).values(row).returning();
  return created ?? null;
};

export const findEmployeeCodes = async (prefix: string) =>
  db.select({ employeeId: employees.employeeId }).from(employees).where(ilike(employees.employeeId, `${prefix}%`));

/** Active employees that have no account yet and an email to sign in with (the New account picker). */
export const findLinkableEmployees = async (search?: string, limit = 50) => {
  const conditions: SQL[] = [eq(employees.status, "Active"), isNull(employees.userId), isNotNull(employees.email)];
  if (search) {
    const s = `%${search}%`;
    conditions.push(or(ilike(employees.name, s), ilike(employees.employeeId, s), ilike(employees.role, s))!);
  }
  return db
    .select({
      id: employees.id,
      employeeId: employees.employeeId,
      name: employees.name,
      email: employees.email,
      role: employees.role,
      department: employees.department,
    })
    .from(employees)
    .where(and(...conditions))
    .orderBy(asc(employees.name), asc(employees.id))
    .limit(limit);
};

export const update = async (id: number, data: UpdateUserInput) => {
  const [updated] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning(PUBLIC_COLUMNS);
  return updated ?? null;
};

/**
 * Writes a bcrypt hash that the caller has already produced — this layer
 * never hashes, and PUBLIC_COLUMNS means the hash is still never read back.
 */
export const setPassword = async (id: number, passwordHash: string) => {
  const [updated] = await db
    .update(users)
    .set({ password: passwordHash, passwordChangedAt: new Date(), tokensValidAfter: new Date(), updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning(PUBLIC_COLUMNS);
  return updated ?? null;
};

export const setActive = async (id: number, isActive: boolean) => {
  const [updated] = await db
    .update(users)
    // Deactivating also ends the sessions that exist now, so reactivating the account later
    // does not bring an old token back to life.
    .set(isActive ? { isActive, updatedAt: new Date() } : { isActive, tokensValidAfter: new Date(), updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning(PUBLIC_COLUMNS);
  return updated ?? null;
};

/**
 * Hard delete. Callers must have checked references first
 * (service.remove) — this does not cascade, so a surviving FK will
 * surface as a Postgres foreign-key violation rather than silently
 * orphaning an employee record or a project membership.
 */
export const remove = async (id: number) => {
  const [deleted] = await db
    .delete(users)
    .where(eq(users.id, id))
    .returning(PUBLIC_COLUMNS);
  return deleted ?? null;
};
