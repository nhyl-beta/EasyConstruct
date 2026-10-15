import { normalizeDeliveryType, Project, ProjectsKpi, RiskLevel, StatusTone } from "../types/project.types";
import { apiClient } from "@/services/api.client";

export interface BackendProject {
  id?: number;
  name: string;
  code: string;
  pm?: string;
  assignedEngineer?: string | null;
  status: string;
  statusTone: string;
  progress: number;
  budget: number;
  contractValue?: string | number | null;
  due: string;
  risk: string;
  location?: string | null;
  client?: string | null;
  clientEmail?: string | null;
  currency?: string | null;
  workforce?: number | null;
  description?: string | null;
  projectType?: string | null;
  plannedStartDate?: string | null;
  scopeSummary?: string | null;
  deliveryType?: string | null;
  designDisciplines?: string[] | null;
  siteLatitude?: string | number | null;
  siteLongitude?: string | number | null;
  geofenceRadiusM?: number | null;
}

const VALID_TONES: StatusTone[] = ["success", "warning", "destructive", "neutral"];
const VALID_RISKS: RiskLevel[] = ["low", "medium", "high"];

function normalizeTone(tone: string | undefined): StatusTone {
  const lower = (tone ?? "").toLowerCase();
  return VALID_TONES.includes(lower as StatusTone) ? (lower as StatusTone) : "neutral";
}

function normalizeRisk(risk: string | undefined): RiskLevel {
  const lower = (risk ?? "").toLowerCase();
  return VALID_RISKS.includes(lower as RiskLevel) ? (lower as RiskLevel) : "low";
}

export function normalizeProject(raw: BackendProject): Project {
  return {
    id: raw.id != null ? String(raw.id) : raw.code,
    code: raw.code,
    name: raw.name,
    pm: raw.pm ?? "Unassigned",
    assignedEngineer: raw.assignedEngineer ?? undefined,
    client: raw.client ?? "Unknown",
    clientEmail: raw.clientEmail ?? null,
    // Pre-currency-column rows come back null; they were all peso projects.
    currency: raw.currency ?? "PHP",
    location: raw.location ?? "Unknown",
    status: raw.status,
    statusTone: normalizeTone(raw.statusTone),
    progress: raw.progress ?? 0,
    budget: raw.budget ?? 0,
    contractValue: raw.contractValue == null ? null : Number(raw.contractValue),
    workforce: raw.workforce ?? 0,
    due: raw.due,
    risk: normalizeRisk(raw.risk),
    // These three were collected by the New Project wizard but dropped on the
    // way through (Bug-008); they are mapped here so the details page shows
    // what was entered.
    description: raw.description ?? null,
    projectType: raw.projectType ?? null,
    plannedStartDate: raw.plannedStartDate ?? null,
    scopeSummary: raw.scopeSummary ?? null,
    // Rows from before the delivery-type column are Construction projects.
    deliveryType: normalizeDeliveryType(raw.deliveryType),
    designDisciplines: raw.designDisciplines ?? [],
    // numeric() columns come back from drizzle as strings.
    siteLatitude: raw.siteLatitude == null ? null : Number(raw.siteLatitude),
    siteLongitude: raw.siteLongitude == null ? null : Number(raw.siteLongitude),
    geofenceRadiusM: raw.geofenceRadiusM ?? null,
  };
}

// The backend's zod schema accepts title-case risk ("Low" | "Medium" | "High")
// and the UI works in lower-case. Normalization on the way in already happens
// in normalizeProject; this is the matching step on the way out, so a create
// from the New Project form doesn't fail validation.
function serializeProject(patch: Partial<Project>): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...patch };
  if (typeof patch.risk === "string") {
    payload.risk = patch.risk.charAt(0).toUpperCase() + patch.risk.slice(1).toLowerCase();
  }
  // Optional text columns come back as null when unset; the API's zod schema
  // wants them absent rather than null (or, for the enum/date ones, non-empty).
  for (const key of ["description", "scopeSummary", "projectType", "plannedStartDate"] as const) {
    if (payload[key] === null || payload[key] === undefined) delete payload[key];
    else if ((key === "projectType" || key === "plannedStartDate") && payload[key] === "") delete payload[key];
  }
  // id is a client-side concern; the backend rejects unknown/extra keys it
  // doesn't model on write.
  delete payload.id;
  delete payload.assignedEngineer;
  return payload;
}

async function unwrap<T>(promise: Promise<unknown>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export interface ProjectPageQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  risk?: string;
  projectType?: string;
  deliveryType?: string;
  excludeArchived?: boolean;
  /** Ask the server for headline counts: "portfolio" ignores search and filters, "filtered" follows them. */
  kpis?: "portfolio" | "filtered";
}

export interface ProjectPage {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  kpis?: ProjectsKpi;
}

export const ProjectRepository = {
  /** Server-side paged + filtered list (All projects table). */
  async listPage(query: ProjectPageQuery): Promise<ProjectPage> {
    const params = new URLSearchParams();
    params.set("page", String(query.page));
    params.set("limit", String(query.pageSize));
    if (query.search) params.set("search", query.search);
    if (query.status && query.status !== "all") params.set("status", query.status);
    if (query.risk && query.risk !== "all") params.set("risk", query.risk);
    if (query.projectType && query.projectType !== "all") params.set("projectType", query.projectType);
    if (query.deliveryType && query.deliveryType !== "all") params.set("deliveryType", query.deliveryType);
    if (query.excludeArchived) params.set("excludeArchived", "1");
    if (query.kpis) params.set("kpis", query.kpis);
    // apiClient returns the raw { success, message, data, meta } envelope.
    const json = (await apiClient.get(`/projects?${params.toString()}`)) as {
      data: BackendProject[];
      meta: { total: number; page: number; pageSize: number; pages: number; kpis?: ProjectsKpi };
    };
    return { items: json.data.map(normalizeProject), ...json.meta };
  },

  /**
   * Every non-archived project the caller can see, fetched a page of 100 at a
   * time (one request for up to 100 projects). For pickers and lookups that
   * need the whole set; tables page through listPage instead.
   */
  async listAll(opts: { excludeArchived?: boolean } = {}): Promise<Project[]> {
    const all: Project[] = [];
    for (let page = 1; ; page++) {
      const result = await ProjectRepository.listPage({
        page,
        pageSize: 100,
        excludeArchived: opts.excludeArchived ?? true,
      });
      all.push(...result.items);
      if (page >= result.pages || result.items.length === 0) return all;
    }
  },

  async list(q?: string): Promise<Project[]> {
    const path = q ? `/projects?search=${encodeURIComponent(q)}` : "/projects";
    const raw = await unwrap<BackendProject[]>(apiClient.get(path));
    return raw.map(normalizeProject);
  },

  // Accepts either the numeric primary key (what the projects table and cards
  // link to) or the project code. Search only matches name/code, so a numeric
  // id has to go through the by-id endpoint or the detail page 404s.
  async getById(idOrCode: string): Promise<Project | null> {
    if (/^\d+$/.test(idOrCode)) {
      try {
        const raw = await unwrap<BackendProject | null>(apiClient.get(`/projects/${idOrCode}`));
        return raw ? normalizeProject(raw) : null;
      } catch {
        return null;
      }
    }
    // `code` is an exact-match filter: one row (or none) however many projects
    // contain this text, so it keeps working under pagination.
    const raw = await unwrap<BackendProject[]>(
      apiClient.get(`/projects?code=${encodeURIComponent(idOrCode)}`),
    );
    const match = raw.find((project) => project.code === idOrCode);
    return match ? normalizeProject(match) : null;
  },

  /**
   * `clientId` links the shared client record and `confirmSimilar` accepts a project whose name is
   * close to an existing one (objectives fix 1.2). Neither is part of the Project view model.
   */
  async create(payload: Partial<Project> & { clientId?: number; confirmSimilar?: boolean }): Promise<Project> {
    const raw = await unwrap<BackendProject>(apiClient.post("/projects", serializeProject(payload)));
    return normalizeProject(raw);
  },

  async patch(code: string, patch: Partial<Project>): Promise<Project | null> {
    const existing = await unwrap<BackendProject[]>(
      apiClient.get(`/projects?code=${encodeURIComponent(code)}`),
    );
    const target = existing.find((project) => project.code === code);
    if (!target?.id) return null;

    const raw = await unwrap<BackendProject>(apiClient.patch(`/projects/${target.id}`, serializeProject(patch)));
    return normalizeProject(raw);
  },

  async delete(code: string): Promise<Project | null> {
    const existing = await unwrap<BackendProject[]>(
      apiClient.get(`/projects?code=${encodeURIComponent(code)}`),
    );
    const target = existing.find((project) => project.code === code);
    if (!target?.id) return null;

    const raw = await unwrap<BackendProject>(apiClient.del(`/projects/${target.id}`));
    return normalizeProject(raw);
  },
};
