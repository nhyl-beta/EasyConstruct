import { z } from "zod";

// A file or a written submission filed against a workflow. `kind` is
// optional: the service infers "document" when a fileUrl is present and
// "note" otherwise, so callers that only have text don't have to say so.
export const workflowAttachmentSchema = z.object({
  kind: z.enum(["document", "note"]).optional(),
  label: z.string().min(1).max(255),
  content: z.string().max(10_000).optional(),
  fileUrl: z.string().max(500).optional(),
  fileName: z.string().max(255).optional(),
  fileSize: z.string().max(20).optional(),
  stageId: z.number().int().optional(),
});

// One materials / labour / other-cost change behind a budget-change request.
export const workflowLineItemSchema = z.object({
  category: z.enum(["materials", "labor", "equipment", "subcontractor", "other"]),
  description: z.string().min(1).max(255),
  currentAmount: z.number().optional(),
  requestedAmount: z.number(),
  // ai-signals: optional inputs for the decision-support cost comparison —
  // without both, the line is simply never compared (a "no-match" reason,
  // not a validation error).
  quantity: z.number().positive().optional(),
  unit: z.string().min(1).max(20).optional(),
});

export const createWorkflowSchema = z.object({
  title: z.string().min(2).max(255),
  projectCode: z.string().min(1).max(50),
  templateId: z.number().int(),
  amount: z.number().nonnegative().optional(),
  type: z.string().max(50).optional(),
  stageAssignments: z.record(z.string(), z.string().max(100)).optional(),
  attachments: z.array(workflowAttachmentSchema).max(20).optional(),
  lineItems: z.array(workflowLineItemSchema).max(100).optional(),
  budgetId: z.number().int().positive().optional(),
});

export const addAttachmentSchema = workflowAttachmentSchema;

// One step of a custom workflow template: which role decides at this point,
// the label shown for it, and the icon key the stage-pipeline UI already
// knows how to render (see apps/web/src/components/workflows/
// workflow-stage-pipeline.tsx's WORKFLOW_STAGE_ICONS — an unknown key just
// falls back to a default icon there, so this is left open rather than
// re-declaring that map on the server).
export const workflowStageDefinitionSchema = z.object({
  role: z.string().min(1).max(40),
  roleLabel: z.string().min(1).max(60),
  iconKey: z.string().min(1).max(30).default("UserCheck"),
});

// ── Template authoring rules ─────────────────────────────────────────────
//
// Mirrored in apps/web/src/components/workflows/new-workflow-template-dialog.tsx
// (that copy only drives what the form offers; this one is the authority).
//
// Roles that can decide a stage — the requireRole() slugs. Owner is absent:
// it is oversight-only everywhere else and never a decision-maker.
export const TEMPLATE_STAGE_ROLES = [
  "project-manager",
  "admin",
  "finance-manager",
  "human-resources",
  "architect",
  "engineer",
  "consultant",
  "site-personnel",
  "it-designer",
] as const;

// The step types (icon keys) a stage can have, and which roles may hold each.
// A step type says what kind of decision the step is, so it can't be given to
// any role at all: a financial review is Finance's, a sign-off is management's.
// null = no restriction.
export const TEMPLATE_STEP_TYPES: Record<string, readonly string[] | null> = {
  UserCheck: null, // Review
  FileSignature: null, // Submission
  Wallet: ["finance-manager"], // Financial review
  ShieldCheck: ["project-manager", "admin"], // Sign-off
};

// Admin/IT Designer defining a reusable workflow template — the steps/roles/
// order a new workflow can later be started from (see workflows/service.ts
// createTemplate). At least 2 stages: a 1-stage "workflow" is really just an
// approval by its own initiator and doesn't need a template of its own.
export const createWorkflowTemplateSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().min(1).max(500),
  avgDurationHours: z.number().positive().max(10_000),
  defaultStages: z.array(workflowStageDefinitionSchema).min(2).max(10),
}).superRefine((data, ctx) => {
  const seen = new Set<string>();
  data.defaultStages.forEach((stage, index) => {
    const path = ["defaultStages", index];
    if (!(TEMPLATE_STAGE_ROLES as readonly string[]).includes(stage.role)) {
      ctx.addIssue({ code: "custom", path: [...path, "role"], message: `'${stage.role}' cannot be assigned to a workflow stage` });
    }
    if (!(stage.iconKey in TEMPLATE_STEP_TYPES)) {
      ctx.addIssue({ code: "custom", path: [...path, "iconKey"], message: `Unknown step type '${stage.iconKey}'` });
    } else {
      const allowed = TEMPLATE_STEP_TYPES[stage.iconKey];
      if (allowed && !allowed.includes(stage.role)) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "role"],
          message: `A '${stage.iconKey}' step can only be assigned to: ${allowed.join(", ")}`,
        });
      }
    }
    // One stage per role. The same role twice in one chain is self-approval
    // by another name, and the pipeline UI keys its stages by role.
    if (seen.has(stage.role)) {
      ctx.addIssue({ code: "custom", path: [...path, "role"], message: `Role '${stage.role}' is already assigned to another stage of this template` });
    }
    seen.add(stage.role);
  });
});

export const decideStageSchema = z.object({
  decision: z.enum(["approve", "reject", "revise"]),
  comments: z.string().max(1000).optional(),
});

// Title/projectCode/severity/type only — stage reassignment goes through
// stageAssignments on create, and decisions go through decideStageSchema.
export const updateWorkflowSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  projectCode: z.string().min(1).max(50).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  type: z.string().max(50).optional(),
});