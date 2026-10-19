import { and, count, desc, eq, gte, ilike, inArray, lte, or, SQL } from "drizzle-orm";
import { db } from "../../../core/db/connection.js";
import { auditLogs } from "../../../core/db/schema/audit-logs.js";
import type { AuditLogFilters, CreateAuditLogInput } from "./types.js";

const DEFAULT_PER_PAGE = 10;

// D1: shared by findAll/findCount so the page of rows and the total they're
// paginated against are always built from the exact same WHERE clause.
const buildConditions = (filters: AuditLogFilters): SQL[] => {
  const conditions: SQL[] = [];
  if (filters.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
  if (filters.entityId) conditions.push(eq(auditLogs.entityId, filters.entityId));
  if (filters.projectCode) conditions.push(eq(auditLogs.projectCode, filters.projectCode));
  if (filters.actions?.length) conditions.push(inArray(auditLogs.action, filters.actions));
  if (filters.actor) conditions.push(eq(auditLogs.actor, filters.actor));
  if (filters.dateFrom) conditions.push(gte(auditLogs.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(auditLogs.createdAt, new Date(filters.dateTo)));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(auditLogs.actor, term),
        ilike(auditLogs.action, term),
        ilike(auditLogs.entityType, term),
        ilike(auditLogs.summary, term),
      )!,
    );
  }
  return conditions;
};

export const AUDIT_SORT_COLUMNS = {
  createdAt: auditLogs.createdAt,
  actor: auditLogs.actor,
  action: auditLogs.action,
  entityType: auditLogs.entityType,
} as const;

export const defaultAuditOrder = [desc(auditLogs.createdAt)];

export const findAll = async (filters: AuditLogFilters = {}, orderBy: SQL[] = defaultAuditOrder) => {
  const conditions = buildConditions(filters);
  const base = db.select().from(auditLogs);
  const scoped = conditions.length ? base.where(and(...conditions)) : base;
  const ordered = scoped.orderBy(...orderBy);

  // Pagination is opt-in: existing callers (dashboard widgets that count or
  // filter across the *whole* audit trail, not just one page of it) pass
  // neither field and keep getting everything, exactly as before D1. Only a
  // caller that explicitly asks for a page (the admin activity-log screen)
  // gets a LIMIT/OFFSET query.
  if (filters.page == null && filters.perPage == null) return ordered;

  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const perPage = filters.perPage && filters.perPage > 0 ? filters.perPage : DEFAULT_PER_PAGE;
  return ordered.limit(perPage).offset((page - 1) * perPage);
};

export const findCount = async (filters: AuditLogFilters = {}) => {
  const conditions = buildConditions(filters);
  const base = db.select({ n: count() }).from(auditLogs);
  const scoped = conditions.length ? base.where(and(...conditions)) : base;
  const [row] = await scoped;
  return row?.n ?? 0;
};

/** Distinct facet values for filter dropdowns — independent of the current
 * page/filter so options never disappear as the user narrows the list. */
export const findFacets = async () => {
  const [entityTypeRows, actorRows] = await Promise.all([
    db.selectDistinct({ entityType: auditLogs.entityType }).from(auditLogs),
    db.selectDistinct({ actor: auditLogs.actor }).from(auditLogs),
  ]);
  return {
    entityTypes: entityTypeRows.map((r) => r.entityType).sort(),
    actors: actorRows.map((r) => r.actor).sort(),
  };
};

export const create = async (data: CreateAuditLogInput) => {
  const [created] = await db.insert(auditLogs).values(data).returning();
  return created;
};

/**
 * Derived "active sessions": the most recent successful sign-in per actor,
 * within the JWT's 8h lifetime.
 *
 * There is no session table because the JWT is stateless — nothing is stored
 * server-side to enumerate. Rather than invent a session store (which would
 * be dishonest about what the auth layer actually does), this reconstructs
 * who currently holds a live token from the login events auth/service.ts
 * records, which is the same information with no new moving parts.
 */
/**
 * Upper bound on the failed-login list the security page loads. Older attempts
 * stay in the audit trail; the overview reports the real total alongside this
 * bound so the UI can say it is showing the newest N of M.
 */
export const FAILED_LOGINS_LIMIT = 200;

export const findRecentSessions = async (withinHours = 8) => {
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entityType, "auth"),
        eq(auditLogs.action, "login"),
        gte(auditLogs.createdAt, since),
      ),
    )
    .orderBy(desc(auditLogs.createdAt));

  // One row per person — the newest sign-in wins.
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.entityId)) latest.set(row.entityId, row);
  }
  return Array.from(latest.values());
};

const failedLoginWhere = () =>
  and(eq(auditLogs.entityType, "auth"), eq(auditLogs.action, "login-failed"));

/** Real number of failed sign-in attempts on record (not capped). */
export const countFailedLogins = async (): Promise<number> => {
  const [row] = await db
    .select({ value: count() })
    .from(auditLogs)
    .where(failedLoginWhere());
  return row?.value ?? 0;
};

/** Failed sign-in attempts, newest first, up to `limit`. */
export const findFailedLogins = async (limit = FAILED_LOGINS_LIMIT) => {
  return db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entityType, "auth"),
        eq(auditLogs.action, "login-failed"),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
};
