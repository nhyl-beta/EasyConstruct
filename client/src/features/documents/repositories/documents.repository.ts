import { apiClient } from "@/services/api.client";

export interface DocumentRecord {
  id: number;
  documentId: string;
  title: string;
  project: string;
  type: string;
  version: string;
  size: string | null;
  uploadedBy?: string;
  fileUrl: string | null;
  // H1: which lifecycle stage (e.g. "Design") this document belongs to.
  stage?: string | null;
  // I: the proposal/design an advisory document concerns (both or neither).
  relatedType?: "proposal" | "design" | null;
  relatedId?: number | null;
  createdAt: string | null;
}

export interface CreateDocumentInput {
  documentId?: string;
  title?: string;
  project: string;
  type: string;
  version?: string;
  fileUrl?: string;
  stage?: string;
}

export interface UploadDocumentInput {
  file: File;
  project: string;
  type: string;
  title?: string;
  stage?: string;
  relatedType?: "proposal" | "design";
  relatedId?: number;
  /** Daily / Weekly / Monthly Report: the period and a date inside it (client demo change #10). */
  reportPeriod?: "daily" | "weekly" | "monthly";
  periodDate?: string;
}

export const documentsRepository = {
  listByProject: (
    project?: string,
    opts: { stage?: string } = {},
  ): Promise<{ data: DocumentRecord[] }> => {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    if (opts.stage) params.set("stage", opts.stage);
    const qs = params.toString();
    return apiClient.get(`/documents${qs ? `?${qs}` : ""}`);
  },

  upload: async (
    input: UploadDocumentInput,
  ): Promise<{ data: DocumentRecord }> => {
    const formData = new FormData();

    formData.append("file", input.file);
    formData.append("project", input.project);
    formData.append("type", input.type);

    if (input.title?.trim()) {
      formData.append("title", input.title.trim());
    }
    if (input.stage) {
      formData.append("stage", input.stage);
    }
    if (input.reportPeriod) {
      formData.append("reportPeriod", input.reportPeriod);
      if (input.periodDate) formData.append("periodDate", input.periodDate);
    }
    if (input.relatedType && input.relatedId) {
      formData.append("relatedType", input.relatedType);
      formData.append("relatedId", String(input.relatedId));
    }

    return apiClient.postFormData(
      "/documents/upload",
      formData,
    );
  },

  remove: (id: number): Promise<{ data: DocumentRecord }> =>
    apiClient.del(`/documents/${id}`),

  create: (
    input: CreateDocumentInput,
  ): Promise<{ data: DocumentRecord }> =>
    apiClient.post("/documents", input),
};
