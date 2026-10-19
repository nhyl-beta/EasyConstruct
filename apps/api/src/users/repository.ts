import { db } from "../core/db/connection.js";
import { users } from "../core/db/schema/users.js";
import { and, asc, eq, ilike, or, SQL } from "drizzle-orm";
import { countRows } from "../core/db/paged.js";
import type { CreateUserInput, UpdateUserInput, UserFilters } from "./types.js";

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
    .select(PUBLIC_COLUMNS)
    .from(users)
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

export const create = async (data: CreateUserInput) => {
  const [created] = await db.insert(users).values(data).returning(PUBLIC_COLUMNS);
  return created ?? null;
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
