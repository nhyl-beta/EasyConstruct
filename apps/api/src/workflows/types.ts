import type {
  WorkflowAttachmentKind,
  WorkflowLineItemCategory,
  WorkflowStageDefinition,
} from "../db/schema/workflows.js";

export type {
  WorkflowAttachmentKind,
  WorkflowLineItemCategory,
  WorkflowStageDefinition,
};

/**
 * A file or written submission filed against a workflow. Supplied at
 * creation time by the role initiating the workflow (the architect's design
 * proposal, the engineer's justification, HR's subcontracting document) or
 * added later through POST /workflows/:id/attachments.
 */
export interface WorkflowAttachmentInput {
  kind?: WorkflowAttachmentKind;
  label: string;
  content?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  stageId?: number;
}

export interface WorkflowAttachmentRecord {
  id: number;
  workflowId: number;
  stageId: number | null;
  kind: string;
  label: string;
  content: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: string | null;
  uploadedBy: string;
  createdAt: Date | null;
  /** Denormalized from the stage so approvers see which step filed this. */
  stageLabel: string | null;
}

/** One materials / labour / other-cost change behind a budget-change request. */
export interface WorkflowLineItemInput {
  category: WorkflowLineItemCategory;
  description: string;
  currentAmount?: number;
  requestedAmount: number;
  quantity?: number;
  unit?: string;
}

export interface WorkflowLineItemRecord {
  id: number;
  workflowId: number;
  category: string;
  description: string;
  currentAmount: string;
  requestedAmount: string;
  quantity: string | null;
  unit: string | null;
  createdAt: Date | null;
  // ai-signals C7: only populated when FEATURES.ai is on — see
  // workflows/service.ts attachStages.
  validation?: import("../ai-validation/types.js").LineItemValidationSummary | null;
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
  /** G4: the budget this workflow's approval should sync on completion —
   * meaningful only for a "Budget Change Request" workflow. */
  budgetId?: number;
}

export interface DecideStageInput {
  decision: "approve" | "reject" | "revise";
  comments?: string;
  decidedBy: string;
}

export interface UpdateWorkflowInput {
  title?: string;
  projectCode?: string;
  severity?: string;
  type?: string;
}

export interface WorkflowWithStages {
  id: number;
  code: string;
  title: string;
  projectCode: string;
  templateId: number | null;
  templateName: string | null;
  budgetId: number | null;
  amount: string | null;
  type: string | null;
  severity: string;
  aiNote: string | null;
  status: string;
  createdBy: string;
  createdByUserId: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  stages: {
    id: number;
    sequence: number;
    role: string;
    roleLabel: string;
    iconKey: string;
    status: string;
    assignedTo: string | null;
    decidedBy: string | null;
    decidedAt: Date | null;
    comments: string | null;
    createdAt: Date | null;
  }[];
  // Everything submitted through the workflow, from every stage — not just
  // the current one. This is what makes a later approver's decision an
  // informed one.
  attachments: WorkflowAttachmentRecord[];
  lineItems: WorkflowLineItemRecord[];
}

export interface TemplateWithActiveCount {
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

export type ApprovalScope = "pending" | "mine" | "history";

export interface ApprovalQueueItem {
  stageId: number;
  workflowId: number;
  workflowCode: string;
  title: string;
  projectCode: string;
  type: string | null;
  amount: string | null;
  severity: string;
  aiNote: string | null;
  ownerRoleLabel: string;
  status: string;
  assignedTo: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date | null;
  /** Counts so a queue row can advertise there is something to read. */
  attachmentCount: number;
  lineItemCount: number;
}