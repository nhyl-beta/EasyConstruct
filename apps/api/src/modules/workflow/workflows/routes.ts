import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../../../core/http/validate.js";
import { authenticate, requireRole } from "../../../core/auth/middleware.js";
import { forecastController } from "../../insights/index.js";
import { advisoryDocumentUpload } from "../../documents/index.js";
import {
  addAttachmentSchema,
  createWorkflowSchema,
  createWorkflowTemplateSchema,
  decideStageSchema,
  updateWorkflowSchema,
} from "./validators.js";

const router = Router();

router.use(authenticate);

// Every role that owns a stage in a seeded template can also start one:
// Architect raises a design-proposal approval or a public-works compliance
// review, Engineer raises a budget-change request, HR raises subcontractor
// planning. Restricting creation to PM/admin was what left those roles with
// a stage to decide but no way to initiate the chain that reaches it.
//
// IT Designer is deliberately absent from every write gate in this file
// (create/update/delete/decide/attach/template) — its workflow scope is
// read-only, unlike its full read+write scope over users/documents/activity
// logs elsewhere. This is enforced here, not just by hiding the client's
// buttons, so a direct API call from that role is rejected too.
const canInitiateWorkflow = requireRole(
  "project-manager",
  "admin",
  "architect",
  "engineer",
  "human-resources",
  "finance-manager",
  "consultant",
);

router.get("/templates", controller.getTemplates);
// Defining a NEW template (the steps/roles/order future workflows can be
// started from) is an org-wide configuration change, not a day-to-day
// workflow action — kept to admin only (see the IT Designer note above).
router.post(
  "/templates",
  requireRole("admin"),
  validate(createWorkflowTemplateSchema),
  controller.createTemplate,
);
router.delete(
  "/templates/:id",
  requireRole("admin"),
  controller.deleteTemplate,
);
router.get("/approvals", controller.getApprovals);
router.get("/approvals/stats", controller.getApprovalStats);
// Before "/:id", or Express matches this path as a workflow id.
router.get(
  "/budget-change-requests",
  requireRole("finance-manager", "project-manager", "admin", "it-designer", "engineer"),
  controller.getBudgetChangeRequests,
);
router.get("/", controller.getAll);
router.get("/:id", controller.getById);
// Fix 3.2: read-only forecast of a cost change, same project scoping as the workflow.
router.get("/:id/impact-forecast", forecastController.workflowForecast);

router.post("/", canInitiateWorkflow, validate(createWorkflowSchema), controller.create);

// Filing a submission against a running workflow. Same role set as creation:
// whoever can start a chain can also add to the one they are standing in.
router.post(
  "/:id/attachments",
  canInitiateWorkflow,
  validate(addAttachmentSchema),
  controller.addAttachment,
);

// Multipart variant. `validate` is deliberately absent — the body arrives as
// multipart form fields, which the JSON schema above cannot parse; the
// controller normalizes and bounds the fields itself.
router.post(
  "/:id/attachments/upload",
  canInitiateWorkflow,
  advisoryDocumentUpload.single("file"),
  controller.uploadAttachment,
);

// Route-level gate is "who may ever call this" (PM/admin);
// "who may call it on THIS workflow" (creator, or admin bypass) is
// enforced in service.assertCanManageWorkflow.
router.patch(
  "/:id",
  requireRole("project-manager", "admin"),
  validate(updateWorkflowSchema),
  controller.update,
);

router.delete(
  "/:id",
  requireRole("project-manager", "admin"),
  controller.remove,
);

router.patch(
  "/:id/stages/:stageId/decision",
  requireRole(
    "project-manager",
    "finance-manager",
    "human-resources",
    "architect",
    "engineer",
    "consultant",
    "admin",
  ),
  validate(decideStageSchema),
  controller.decideStage,
);

// D4: route guard is just "who may ever call this" — "only the workflow's
// own initiator" is a per-row ownership check that belongs in the service
// (resubmitStage), same split as assertCanManageWorkflow.
router.post(
  "/:id/stages/:stageId/resubmit",
  canInitiateWorkflow,
  controller.resubmitStage,
);

// ai-signals C8: manual "re-check market cost" — decision support only,
// so it needs no gate beyond who's allowed to review the numbers at all.
router.post(
  "/:id/revalidate",
  requireRole("finance-manager", "admin"),
  controller.revalidate,
);

export default router;
