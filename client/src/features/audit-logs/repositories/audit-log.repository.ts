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

export const AuditLogRepository = {
  async list(query: AuditLogsQuery = {}): Promise<AuditLogsResult> {
    const params = new URLSearchParams();
    if (query.entityType) params.set("entityType", query.entityType);
    if (query.entityId) params.set("entityId", query.entityId);
    if (query.projectCode) params.set("projectCode", query.projectCode);
    if (query.actions?.length) params.set("actions", query.actions.join(","));
    if (query.search) params.set("search", query.search);
    if (query.actor) params.set("actor", query.actor);
    if (query.dateFrom) params.set("dateFrom", query.dateFrom);
    if (query.dateTo) params.set("dateTo", query.dateTo);
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
