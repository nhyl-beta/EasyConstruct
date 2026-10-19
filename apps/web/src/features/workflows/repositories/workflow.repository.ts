import { apiClient } from "@/services/api.client";
import type {
  ApprovalQueueItem,
  ApprovalScope,
  ApprovalStats,
  CreateWorkflowInput,
  CreateWorkflowTemplateInput,
  DecideStageInput,
  UpdateWorkflowInput,
  Workflow,
  WorkflowAttachmentInput,
  WorkflowTemplate,
} from "../types/workflow.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const WorkflowRepository = {
  async listTemplates(): Promise<WorkflowTemplate[]> {
    // Templates are configuration: cached for five minutes (a write to /workflows invalidates them).
    return unwrap<WorkflowTemplate[]>(apiClient.get("/workflows/templates", { staleTime: 5 * 60_000 }));
  },

  /** Admin/IT Designer defining a new, reusable workflow template. */
  async createTemplate(input: CreateWorkflowTemplateInput): Promise<WorkflowTemplate> {
    return unwrap<WorkflowTemplate>(apiClient.post("/workflows/templates", input));
  },

  /** Admin only — rejected server-side if any workflow was ever raised from it. */
  async deleteTemplate(id: number): Promise<WorkflowTemplate> {
    return unwrap<WorkflowTemplate>(apiClient.del(`/workflows/templates/${id}`));
  },

  async listActive(): Promise<Workflow[]> {
    return unwrap<Workflow[]>(apiClient.get("/workflows"));
  },

  /** One page of active workflows (server-side paging and search). */
  async listActivePage(params: { page: number; limit: number; search?: string }): Promise<{ items: Workflow[]; total: number; pages: number }> {
    const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
    if (params.search) qs.set("search", params.search);
    const json = (await apiClient.get(`/workflows?${qs.toString()}`)) as {
      data: Workflow[];
      meta: { total: number; pages: number };
    };
    return { items: json.data, total: json.meta.total, pages: json.meta.pages };
  },

  async getById(id: number): Promise<Workflow> {
    return unwrap<Workflow>(apiClient.get(`/workflows/${id}`));
  },

  async create(input: CreateWorkflowInput): Promise<Workflow> {
    return unwrap<Workflow>(apiClient.post("/workflows", input));
  },

  async update(id: number, input: UpdateWorkflowInput): Promise<Workflow> {
    return unwrap<Workflow>(apiClient.patch(`/workflows/${id}`, input));
  },

  async remove(id: number): Promise<Workflow> {
    return unwrap<Workflow>(apiClient.del(`/workflows/${id}`));
  },

  async decideStage(
    workflowId: number,
    stageId: number,
    input: DecideStageInput,
  ): Promise<Workflow> {
    return unwrap<Workflow>(
      apiClient.patch(`/workflows/${workflowId}/stages/${stageId}/decision`, input),
    );
  },

  /** Only the workflow's own initiator, or admin — enforced server-side. */
  async resubmitStage(workflowId: number, stageId: number): Promise<Workflow> {
    return unwrap<Workflow>(
      apiClient.post(`/workflows/${workflowId}/stages/${stageId}/resubmit`, {}),
    );
  },

  async listApprovals(scope: ApprovalScope, limit?: number): Promise<ApprovalQueueItem[]> {
    return unwrap<ApprovalQueueItem[]>(
      apiClient.get(`/workflows/approvals?scope=${scope}${limit ? `&page=1&limit=${limit}` : ""}`),
    );
  },

  async getApprovalStats(): Promise<ApprovalStats> {
    return unwrap<ApprovalStats>(apiClient.get("/workflows/approvals/stats"));
  },

  /** Files a note or a link against a running workflow. Returns the workflow. */
  async addAttachment(
    workflowId: number,
    input: WorkflowAttachmentInput,
  ): Promise<Workflow> {
    return unwrap<Workflow>(
      apiClient.post(`/workflows/${workflowId}/attachments`, input),
    );
  },

  /**
   * Multipart variant of addAttachment. Goes through the workflows module
   * rather than /documents/upload so roles without a documents page (HR,
   * Engineer, Architect) can still attach a file to a workflow.
   */
  async uploadAttachment(
    workflowId: number,
    file: File,
    label?: string,
  ): Promise<Workflow> {
    const formData = new FormData();
    formData.append("file", file);
    if (label?.trim()) formData.append("label", label.trim());
    return unwrap<Workflow>(
      apiClient.postFormData(`/workflows/${workflowId}/attachments/upload`, formData),
    );
  },

  /**
   * Every workflow raised from the "Budget Change Request" template, each
   * with its line items attached — Finance's review of what actually changed.
   */
  async listBudgetChangeRequests(): Promise<Workflow[]> {
    return unwrap<Workflow[]>(apiClient.get("/workflows/budget-change-requests"));
  },

  /** ai-signals C8: re-runs the decision-support cost comparison on demand. */
  async revalidate(workflowId: number): Promise<Workflow> {
    return unwrap<Workflow>(apiClient.post(`/workflows/${workflowId}/revalidate`, {}));
  },
};
// ── Impact forecast (objectives fix 3.2): read-only decision support ──────

export interface ImpactForecastData {
  contractValue: number | null;
  currentPlanned: number;
  actualToDate: number;
  requestedAmount: number;
  newTotal: number;
  percentOverContract: number | null;
  completionPct: number | null;
  estimateAtCompletion: number | null;
  estimateAtCompletionIfApproved: number | null;
  projectedOverrun: number | null;
  scheduleSlipDays: number;
  movedMilestones: { id: number; title: string; from: string; to: string }[];
  severity: "info" | "warn" | "critical";
  basis: string[];
  sentence: string;
}

export type WorkflowImpactForecast =
  | { applicable: false; reason: string }
  | {
      applicable: true;
      workflowId: number;
      projectCode: string;
      template: string;
      forecast: ImpactForecastData;
      notes: string[];
    };

export const WorkflowForecastRepository = {
  get: (workflowId: number, timeImpactDays = 0): Promise<WorkflowImpactForecast> =>
    unwrap<WorkflowImpactForecast>(
      apiClient.get(`/workflows/${workflowId}/impact-forecast?timeImpactDays=${timeImpactDays}`),
    ),
};
