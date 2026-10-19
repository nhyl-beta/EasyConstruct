// apps/web/src/features/milestones/repositories/milestone.repository.ts — NEW
import { apiClient } from "@/services/api.client";

export type MilestoneStatus = "draft" | "active" | "at-risk" | "completed" | "cancelled";

export interface Milestone {
  id: number;
  projectCode: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  estimatedCompletionDate: string | null;
  createdBy: string;
  /** Set when the milestone was completed (null for older rows / not completed). */
  completedBy?: string | null;
  completedAt?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateMilestoneInput {
  projectCode: string;
  title: string;
  description?: string;
  estimatedCompletionDate?: string;
}

export interface UpdateMilestoneInput {
  title?: string;
  description?: string;
  status?: MilestoneStatus;
  estimatedCompletionDate?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const MilestoneRepository = {
  /** Every milestone the caller can see (the server scopes PMs to their own projects). */
  async listAll(): Promise<Milestone[]> {
    return unwrap<Milestone[]>(apiClient.get("/milestones"));
  },

  async listByProject(projectCode: string): Promise<Milestone[]> {
    return unwrap<Milestone[]>(
      apiClient.get(`/milestones?projectCode=${encodeURIComponent(projectCode)}`),
    );
  },

  async create(input: CreateMilestoneInput): Promise<Milestone> {
    return unwrap<Milestone>(apiClient.post("/milestones", input));
  },

  async update(id: number, input: UpdateMilestoneInput): Promise<Milestone> {
    return unwrap<Milestone>(apiClient.patch(`/milestones/${id}`, input));
  },

  async remove(id: number): Promise<Milestone> {
    return unwrap<Milestone>(apiClient.del(`/milestones/${id}`));
  },

  /** F4: linkType='task' is the only kind anything creates yet. */
  async createLink(milestoneId: number, linkType: "task", linkId: number): Promise<Milestone> {
    return unwrap<Milestone>(apiClient.post(`/milestones/${milestoneId}/links`, { linkType, linkId }));
  },
};
