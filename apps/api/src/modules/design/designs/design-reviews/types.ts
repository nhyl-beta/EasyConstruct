// types.ts
export interface DesignReviewRecord {
  id: number;
  code: string;
  designId: number;
  discipline: string | null;
  priority: string;
  reviewers: string | null;
  requestedBy: string;
  status: string;
  submittedAt: Date | null;
  dueDate: string | null;
  completedAt: Date | null;
}

export interface CreateDesignReviewInput {
  code: string;
  designId: number;
  discipline?: string;
  priority?: string;
  reviewers?: string;
  requestedBy: string;
  dueDate?: string;
}

export interface DecideDesignReviewInput {
  id: number;
  decision: "Approved" | "Rejected" | "Changes Requested";
}

export interface DesignReviewFilters {
  designId?: number;
  status?: string;
}
