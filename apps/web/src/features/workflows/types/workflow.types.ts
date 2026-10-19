export interface WorkflowStageDefinition {
  role: string;
  roleLabel: string;
  iconKey: string;
}

export interface WorkflowTemplate {
  id: number;
  name: string;
  description: string;
  avgDurationHours: string;
  defaultStages: WorkflowStageDefinition[];
  activeCount: number;
}

/** Admin/IT Designer defining a new, reusable workflow template. */
export interface CreateWorkflowTemplateInput {
  name: string;
  description: string;
  avgDurationHours: number;
  defaultStages: WorkflowStageDefinition[];
}

export type StageStatus = "upcoming" | "current" | "done" | "rejected" | "revision-required";

export interface WorkflowStage {
  id: number;
  sequence: number;
  role: string;
  roleLabel: string;
  iconKey: string;
  status: StageStatus;
  assignedTo: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  comments: string | null;
  createdAt: string | null;
}

export type WorkflowAttachmentKind = "document" | "note";

/**
 * Something submitted through the workflow — a file or a written submission,
 * tagged with the stage that filed it. This is what makes a later approver
 * (Consultant, PM, Admin) able to see what the earlier stages actually sent.
 */
export interface WorkflowAttachment {
  id: number;
  workflowId: number;
  stageId: number | null;
  kind: WorkflowAttachmentKind | string;
  label: string;
  content: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: string | null;
  uploadedBy: string;
  createdAt: string | null;
  stageLabel: string | null;
}

export type WorkflowLineItemCategory =
  | "materials"
  | "labor"
  | "equipment"
  | "subcontractor"
  | "other";

export type ValidationVerdict = "within-range" | "above-typical" | "below-typical" | "no-match";

export interface LineItemValidationSource {
  source: string;
  itemName: string;
  sourceUrl: string | null;
  fetchedAt: string;
  fxRate?: number;
  fxAsOf?: string;
}

/** Decision-support cost comparison for one line item — only present when
 * FEATURES.ai is on server-side. Never affects approval. */
export interface LineItemValidationSummary {
  verdict: ValidationVerdict;
  variancePct: number | null;
  referenceLowPhp: number | null;
  referenceMidPhp: number | null;
  referenceHighPhp: number | null;
  basisSummary: string;
  sources: LineItemValidationSource[] | null;
}

/** One cost change behind a budget-change request's headline amount. */
export interface WorkflowLineItem {
  id: number;
  workflowId: number;
  category: WorkflowLineItemCategory | string;
  description: string;
  currentAmount: string;
  requestedAmount: string;
  quantity: string | null;
  unit: string | null;
  createdAt: string | null;
  validation?: LineItemValidationSummary | null;
}

export interface WorkflowAttachmentInput {
  kind?: WorkflowAttachmentKind;
  label: string;
  content?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  stageId?: number;
}

export interface WorkflowLineItemInput {
  category: WorkflowLineItemCategory;
  description: string;
  currentAmount?: number;
  requestedAmount: number;
  quantity?: number;
  unit?: string;
}

export type WorkflowStatus = "active" | "completed" | "rejected" | "cancelled";

export interface Workflow {
  id: number;
  code: string;
  title: string;
  projectCode: string;
  templateId: number | null;
  templateName: string | null;
  budgetId: number | null;
  amount: string | null;
  type: string | null;
  severity: "high" | "medium" | "low";
  aiNote: string | null;
  status: WorkflowStatus;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
  stages: WorkflowStage[];
  attachments: WorkflowAttachment[];
  lineItems: WorkflowLineItem[];
}

export interface CreateWorkflowInput {
  title: string;
  projectCode: string;
  templateId: number;
  amount?: number;
  type?: string;
  stageAssignments?: Record<string, string>;
  /** Filed against the first stage — the initiator's own step. */
  attachments?: WorkflowAttachmentInput[];
  lineItems?: WorkflowLineItemInput[];
  /** G4: the budget a "Budget Change Request" workflow's approval syncs. */
  budgetId?: number;
}

export interface UpdateWorkflowInput {
  title?: string;
  projectCode?: string;
  severity?: "low" | "medium" | "high";
  type?: string;
}

export type Decision = "approve" | "reject" | "revise";

export interface DecideStageInput {
  decision: Decision;
  comments?: string;
}

export type ApprovalScope = "pending" | "mine" | "history";

export interface ApprovalQueueItem {
  stageId: number;
  workflowId: number;
  workflowCode: string;
  title: string;
  projectCode: string;
  type: string | null;
  amount: string | null;
  severity: "high" | "medium" | "low";
  aiNote: string | null;
  ownerRoleLabel: string;
  status: StageStatus;
  assignedTo: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string | null;
  // G2: who raised the underlying workflow — powers the requester filter.
  requestedBy?: string;
  attachmentCount: number;
  lineItemCount: number;
}

export interface ApprovalStats {
  pending: number;
  overdue: number;
  avgCycleDays: number;
  thisWeek: number;
}