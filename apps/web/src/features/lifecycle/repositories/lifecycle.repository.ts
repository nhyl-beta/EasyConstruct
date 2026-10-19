import { apiClient } from "@/services/api.client";
import type { CloseoutSummary, ImpactAwareness, LifecycleView } from "../types/lifecycle.types";
import type { MyActionItem } from "../types/my-actions.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const LifecycleRepository = {
  async get(projectId: string | number): Promise<LifecycleView> {
    return unwrap<LifecycleView>(apiClient.get(`/projects/${projectId}/lifecycle`));
  },

  async advance(
    projectId: string | number,
    input: { reason?: string; override?: boolean } = {},
  ): Promise<LifecycleView> {
    return unwrap<LifecycleView>(apiClient.post(`/projects/${projectId}/lifecycle/advance`, input));
  },

  async hold(projectId: string | number, reason: string): Promise<LifecycleView> {
    return unwrap<LifecycleView>(apiClient.post(`/projects/${projectId}/lifecycle/hold`, { reason }));
  },

  async resume(projectId: string | number): Promise<LifecycleView> {
    return unwrap<LifecycleView>(apiClient.post(`/projects/${projectId}/lifecycle/resume`, {}));
  },

  async cancel(projectId: string | number, reason: string): Promise<LifecycleView> {
    return unwrap<LifecycleView>(apiClient.post(`/projects/${projectId}/lifecycle/cancel`, { reason }));
  },

  async archive(projectId: string | number): Promise<LifecycleView> {
    return unwrap<LifecycleView>(apiClient.post(`/projects/${projectId}/lifecycle/archive`, {}));
  },

  // H6
  async getCloseoutSummary(projectId: string | number): Promise<CloseoutSummary> {
    return unwrap<CloseoutSummary>(apiClient.get(`/projects/${projectId}/lifecycle/closeout-summary`));
  },

  // Read-only decision-support signals across the projects the caller can see.
  async getImpact(): Promise<ImpactAwareness> {
    return unwrap<ImpactAwareness>(apiClient.get(`/lifecycle/impact`));
  },

  // K1
  async getMyActions(): Promise<MyActionItem[]> {
    return unwrap<MyActionItem[]>(apiClient.get(`/lifecycle/my-actions`));
  },
};
