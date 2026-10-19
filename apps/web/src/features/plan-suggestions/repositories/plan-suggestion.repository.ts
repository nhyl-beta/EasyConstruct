import { apiClient } from "@/services/api.client";
import type { RankedAssignee } from "@/features/tasks/repositories/task.repository";

export type PlanItemKind = "milestone" | "task" | "responsibility";
export type PlanItemState = "pending" | "accepted" | "discarded";

export interface PlanItem {
  id: number;
  kind: PlanItemKind;
  state: PlanItemState;
  /** Shape depends on `kind`; every payload carries `key` and `basis`. */
  payload: Record<string, unknown> & { key: string; basis: string };
  createdRef: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  suggestedAssignees: RankedAssignee[];
}

export interface PlanSuggestion {
  id: number;
  projectCode: string;
  proposalId: number;
  status: "open" | "complete";
  basis: string;
  createdAt: string;
  counts: { pending: number; accepted: number; discarded: number };
  items: PlanItem[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const planSuggestionRepository = {
  listByProject: (projectCode: string) =>
    unwrap<PlanSuggestion[]>(apiClient.get(`/plan-suggestions?projectCode=${encodeURIComponent(projectCode)}`)),
  accept: (id: number, itemId: number, assignedToUserId?: number) =>
    unwrap<PlanItem>(apiClient.post(`/plan-suggestions/${id}/items/${itemId}/accept`, assignedToUserId ? { assignedToUserId } : {})),
  discard: (id: number, itemId: number) =>
    unwrap<PlanItem>(apiClient.post(`/plan-suggestions/${id}/items/${itemId}/discard`, {})),
  regenerate: (id: number) => unwrap<PlanSuggestion[]>(apiClient.post(`/plan-suggestions/${id}/regenerate`, {})),
};
