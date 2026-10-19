import { apiClient } from "@/services/api.client";

export const DELIVERABLE_STATUSES = ["not_started", "in_progress", "for_review", "approved", "issued"] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  for_review: "For review",
  approved: "Approved",
  issued: "Issued",
};

export interface PlanSet {
  id: number;
  projectCode: string;
  discipline: string;
  sheetRange: string | null;
  leadUserId: number | null;
  leadName: string | null;
  status: DeliverableStatus;
  points: number;
  designs: { id: number; code: string; name: string; status: string; fileCount: number }[];
  openRequests: { id: number; number: string; subject: string; status: string; dueDate: string | null; overdue: boolean }[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const normalize = (r: any): PlanSet => ({
  ...r,
  status: (DELIVERABLE_STATUSES as readonly string[]).includes(r.status) ? r.status : "not_started",
  designs: r.designs ?? [],
  openRequests: r.openRequests ?? [],
});

async function unwrap<T>(promise: Promise<unknown>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return (json as { data: T }).data;
  return json as T;
}

export const DeliverableRepository = {
  async list(projectCode: string): Promise<PlanSet[]> {
    return (await unwrap<any[]>(apiClient.get(`/deliverables?projectCode=${encodeURIComponent(projectCode)}`))).map(normalize);
  },
  async update(id: number, patch: { sheetRange?: string | null; leadUserId?: number | null; status?: DeliverableStatus }): Promise<void> {
    await apiClient.patch(`/deliverables/${id}`, patch);
  },
  async add(projectCode: string, discipline: string): Promise<void> {
    await apiClient.post("/deliverables", { projectCode, discipline });
  },
};
