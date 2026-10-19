import * as repo from "./repository.js";
import type { AuditLogFilters, CreateAuditLogInput } from "./types.js";
import { auditLogs } from "../db/schema/audit-logs.js";
import { orderByFor, paginate, type PageRequest } from "../utils/pagination.js";

export const getAll = async (filters: AuditLogFilters) => {
  const [data, total] = await Promise.all([repo.findAll(filters), repo.findCount(filters)]);
  return { data, total };
};

/** One page of the activity log: { data, total } as before, plus the page window in `meta`. */
export const getPage = async (filters: AuditLogFilters, request: PageRequest) => {
  const orderBy = orderByFor(request, repo.AUDIT_SORT_COLUMNS, repo.defaultAuditOrder, auditLogs.id);
  const { items, meta } = await paginate(
    request,
    () => repo.findCount(filters),
    ({ limit, offset }) =>
      repo.findAll({ ...filters, page: Math.floor(offset / limit) + 1, perPage: limit }, orderBy),
  );
  return { result: { data: items, total: meta.total }, meta };
};

export const getFacets = async () => repo.findFacets();

// Called directly by other domain services — no HTTP loopback.
export const create = async (input: CreateAuditLogInput) => repo.create(input);

// Backs the Security / System Oversight panel: who is signed in right now
// (derived from login events — the JWT is stateless) and what failed.
export const getSecurityOverview = async () => {
  const [sessions, failedLogins, totalFailedLogins] = await Promise.all([
    repo.findRecentSessions(),
    repo.findFailedLogins(repo.FAILED_LOGINS_LIMIT),
    repo.countFailedLogins(),
  ]);
  return {
    sessions,
    failedLogins,
    // failedLogins is the newest `failedLoginsLimit` rows; this is how many
    // exist in all, so a capped list never reads as the whole picture.
    totalFailedLogins,
    failedLoginsLimit: repo.FAILED_LOGINS_LIMIT,
  };
};
