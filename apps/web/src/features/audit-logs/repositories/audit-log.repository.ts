import { apiClient } from "@/services/api.client";
import type {
  AuditLogFacets,
  AuditLogsQuery,
  AuditLogsResult,
  SecurityOverview,
} from "../types/audit-log.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

// B-42: the date pickers give a bare day (YYYY-MM-DD) and the table shows times in the viewer's own
// timezone, but the API reads a bare day as UTC. Send the viewer's local day boundaries instead, so
// "Nov 3 to Nov 3" returns exactly the rows the table shows under Nov 3.
const BARE_DAY = /^\d{4}-\d{2}-\d{2}$/;
const startOfLocalDay = (d: string) => (BARE_DAY.test(d) ? new Date(`${d}T00:00:00`).toISOString() : d);
const endOfLocalDay = (d: string) => (BARE_DAY.test(d) ? new Date(`${d}T23:59:59.999`).toISOString() : d);

export const AuditLogRepository = {
  async list(query: AuditLogsQuery = {}): Promise<AuditLogsResult> {
    const params = new URLSearchParams();
    if (query.entityType) params.set("entityType", query.entityType);
    if (query.entityId) params.set("entityId", query.entityId);
    if (query.projectCode) params.set("projectCode", query.projectCode);
    if (query.actions?.length) params.set("actions", query.actions.join(","));
    if (query.search) params.set("search", query.search);
    if (query.actor) params.set("actor", query.actor);
    if (query.dateFrom) params.set("dateFrom", startOfLocalDay(query.dateFrom));
    if (query.dateTo) params.set("dateTo", endOfLocalDay(query.dateTo));
    if (query.page) params.set("page", String(query.page));
    if (query.perPage) params.set("perPage", String(query.perPage));
    const qs = params.toString();
    return unwrap<AuditLogsResult>(apiClient.get(`/audit-logs${qs ? `?${qs}` : ""}`));
  },

  async facets(): Promise<AuditLogFacets> {
    return unwrap<AuditLogFacets>(apiClient.get("/audit-logs/facets"));
  },

  // Live sign-in activity: who currently holds a valid token (derived from
  // login events — the JWT is stateless) and recent failed attempts.
  async securityOverview(): Promise<SecurityOverview> {
    return unwrap<SecurityOverview>(apiClient.get("/audit-logs/security-overview"));
  },
};
