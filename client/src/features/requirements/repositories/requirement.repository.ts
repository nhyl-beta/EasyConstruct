import { apiClient } from "@/services/api.client";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type {
  CreateRequirementInput,
  Requirement,
  RequirementAttachment,
  RequirementFilters,
  StructureRequirementInput,
  StructuredRequirement,
  RequirementDraft,
  GenerateDraftInput,
} from "../types/requirements.types";

interface BackendRequirement {
  id: number;
  requirementId: string;
  title: string;
  project: string;
  category: string;
  description: string;
  status: string;
  attachments?: RequirementAttachment[] | null;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
}

function normalizeRequirement(raw: BackendRequirement): Requirement {
  return {
    id: raw.requirementId,
    dbId: raw.id,
    title: raw.title,
    project: raw.project,
    category: raw.category as Requirement["category"],
    description: raw.description,
    status: raw.status as Requirement["status"],
    attachments: raw.attachments ?? [],
    createdBy: raw.createdBy,
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

export interface RequirementsPage {
  items: Requirement[];
  total: number;
  pages?: number;
  /** Requirements per status across the caller's whole scope (all pages). */
  statusCounts: { key: string; count: number }[];
}

export const RequirementRepository = {
  /** One page of the list plus the per-status headline counts (`counts=1`). */
  async listPage(page: number, limit: number, signal?: AbortSignal): Promise<RequirementsPage> {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), counts: "1" });
    const json = (await apiClient.get(`/requirements?${qs.toString()}`, { signal })) as {
      data?: BackendRequirement[];
      meta?: { total?: number; pages?: number; statusCounts?: { key: string; count: number }[] };
    };
    return {
      items: (json.data ?? []).map(normalizeRequirement),
      total: json.meta?.total ?? 0,
      pages: json.meta?.pages,
      statusCounts: json.meta?.statusCounts ?? [],
    };
  },

  async list(filters: RequirementFilters = {}): Promise<Requirement[]> {
    const params = new URLSearchParams();
    if (filters.project) params.set("project", filters.project);
    if (filters.category) params.set("category", filters.category);
    if (filters.status) params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);
    const qs = params.toString();
    const raw = await unwrap<BackendRequirement[]>(
      apiClient.get(`/requirements${qs ? `?${qs}` : ""}`),
    );
    return raw.map(normalizeRequirement);
  },

  async create(payload: CreateRequirementInput): Promise<Requirement> {
    const raw = await unwrap<BackendRequirement>(apiClient.post("/requirements", payload));
    return normalizeRequirement(raw);
  },

  /** Rule-based structuring (engineer/admin, FEATURE_AI). Nothing is saved. */
  async structure(input: StructureRequirementInput): Promise<StructuredRequirement> {
    return unwrap<StructuredRequirement>(apiClient.post("/requirements/structure", input));
  },

  /** Rule-based draft from the template packs (engineer/admin). Nothing is saved. */
  async generateDraft(input: GenerateDraftInput): Promise<RequirementDraft> {
    return unwrap<RequirementDraft>(apiClient.post("/requirements/generate-draft", input));
  },

  /** Engineer submits a saved draft: Draft → Under Review (pending PM approval). */
  async submit(dbId: number): Promise<Requirement> {
    const raw = await unwrap<BackendRequirement>(
      apiClient.patch(`/requirements/${dbId}`, { status: "Under Review" }),
    );
    return normalizeRequirement(raw);
  },

  /** Replaces the attached files (the caller passes the full new list). */
  async setAttachments(dbId: number, attachments: RequirementAttachment[]): Promise<Requirement> {
    const raw = await unwrap<BackendRequirement>(
      apiClient.patch(`/requirements/${dbId}`, { attachments }),
    );
    return normalizeRequirement(raw);
  },

  /** F1: PM approve/reject. Only `status` is ever sent from this path. */
  async setStatus(dbId: number, status: "Approved" | "Rejected"): Promise<Requirement> {
    const raw = await unwrap<BackendRequirement>(apiClient.patch(`/requirements/${dbId}`, { status }));
    return normalizeRequirement(raw);
  },
};
