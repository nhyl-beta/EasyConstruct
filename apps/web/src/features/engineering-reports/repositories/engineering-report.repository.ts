import { apiClient } from "@/services/api.client";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type {
  CreateEngineeringReportInput,
  EngineeringReport,
  EngineeringReportFilters,
} from "../types/engineering-reports.types";

export interface BackendEngineeringReport {
  id: number;
  reportId: string;
  title: string;
  type: string;
  project: string;
  location: string;
  date: string;
  engineer: string;
  priority: string;
  description: string;
  findings: string;
  measurements: string | null;
  observations: string | null;
  recommendations: string;
  requiredActions: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export function normalizeReport(raw: BackendEngineeringReport): EngineeringReport {
  return {
    id: raw.reportId,
    dbId: raw.id,
    title: raw.title,
    type: raw.type as EngineeringReport["type"],
    project: raw.project,
    location: raw.location,
    date: raw.date,
    engineer: raw.engineer,
    priority: raw.priority as EngineeringReport["priority"],
    description: raw.description,
    findings: raw.findings,
    measurements: raw.measurements ?? undefined,
    observations: raw.observations ?? undefined,
    recommendations: raw.recommendations,
    requiredActions: raw.requiredActions ?? undefined,
    status: raw.status as EngineeringReport["status"],
    updatedAgo: formatRelativeTime(raw.updatedAt),
  };
}

async function unwrap<T>(promise: Promise<unknown>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export const EngineeringReportRepository = {
  async list(filters: EngineeringReportFilters = {}): Promise<EngineeringReport[]> {
    const params = new URLSearchParams();
    if (filters.project) params.set("project", filters.project);
    if (filters.type) params.set("type", filters.type);
    if (filters.status) params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);
    const qs = params.toString();
    const raw = await unwrap<BackendEngineeringReport[]>(
      apiClient.get(`/engineering-reports${qs ? `?${qs}` : ""}`),
    );
    return raw.map(normalizeReport);
  },

  async create(payload: CreateEngineeringReportInput): Promise<EngineeringReport> {
    const raw = await unwrap<BackendEngineeringReport>(
      apiClient.post("/engineering-reports", payload),
    );
    return normalizeReport(raw);
  },

  // Q5: apps/api/src/engineering-reports/routes.ts restricts this to
  // engineer/admin/project-manager — an engineer reviewing their own
  // submission is a service-layer 403, not something this method guards.
  async updateStatus(dbId: number, status: EngineeringReport["status"]): Promise<EngineeringReport> {
    const raw = await unwrap<BackendEngineeringReport>(
      apiClient.patch(`/engineering-reports/${dbId}`, { status }),
    );
    return normalizeReport(raw);
  },
};
