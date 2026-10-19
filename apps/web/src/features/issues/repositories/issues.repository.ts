// apps/web/src/features/issues/repositories/issues.repository.ts — NEW
import { apiClient } from "@/services/api.client";

export interface IssueRecord {
  id: number;
  issueCode: string;
  projectCode: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  siteContext: string | null;
  createdAt: string | null;
}

export interface CreateIssueInput {
  issueCode: string;
  projectCode: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  siteContext?: string;
  attachmentUrl?: string;
}

export interface UpdateIssueStatusInput {
  status: "Submitted" | "Under Review" | "Resolved" | "Rejected";
  resolutionNotes?: string;
}

export interface IssuePrecedent {
  issueCode: string;
  title: string;
  resolutionNotes: string;
  updatedAt: string | null;
}

/** B2: a resolved issue similar to the one being viewed (rule-based, FEATURE_AI). */
export interface SimilarResolvedIssue {
  issueCode: string;
  projectCode: string;
  title: string;
  resolutionNotes: string;
  resolvedAt: string | null;
  /** Match score, 0.40–1.00. */
  score: number;
}

export const issuesRepository = {
  listMine: (): Promise<{ data: IssueRecord[] }> => apiClient.get("/issues"),
  /** ai-signals E5: [] whenever FEATURES.ai is off server-side. */
  precedentsByCategory: (category: string): Promise<{ data: IssuePrecedent[] }> =>
    apiClient.get(`/issues/precedents/${encodeURIComponent(category)}`),
  /** B2: [] when FEATURES.ai is off server-side or nothing clears the similarity floor. */
  precedentsForIssue: (id: number): Promise<{ data: SimilarResolvedIssue[] }> =>
    apiClient.get(`/issues/${id}/precedents`),
  list: (filters?: { projectCode?: string; status?: string }): Promise<{ data: IssueRecord[] }> => {
    const params = new URLSearchParams();
    if (filters?.projectCode) params.set("projectCode", filters.projectCode);
    if (filters?.status) params.set("status", filters.status);
    const qs = params.toString();
    return apiClient.get(`/issues${qs ? `?${qs}` : ""}`);
  },
  create: (input: CreateIssueInput): Promise<{ data: IssueRecord }> =>
    apiClient.post("/issues", input),
  updateStatus: (id: number, input: UpdateIssueStatusInput): Promise<{ data: IssueRecord }> =>
    apiClient.patch(`/issues/${id}/status`, input),
};