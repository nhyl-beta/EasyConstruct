import { Router } from "express";

import * as controller from "./controller.js";

import {
  authenticate,
  requireRole,
} from "../../../core/auth/middleware.js";

import { validate } from "../../../core/http/validate.js";

import {
  createDocumentSchema,
  updateDocumentSchema,
} from "./validators.js";

import {
  advisoryDocumentUpload,
} from "./upload.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  controller.getAll,
);

// Which Daily / Weekly / Monthly Reports a project has and is missing (client demo change #10). Before any "/:id" route.
router.get("/report-status", controller.reportStatus);

router.post(
  "/",
  validate(createDocumentSchema),
  controller.create,
);

// Despite the middleware's name (originally built for Consultant advisory
// docs), this endpoint is the shared document-upload path for every role
// with a documents page: PM/Admin (pm-documents.tsx, reused by
// admin-documents.tsx) and Site Personnel (sp-documents.tsx) both call it
// via the same useFieldDocuments hook.
// H7: Architect added so they can file an As-Built Drawing at Closeout
// (gate X2's Certificate of Completion is PM/Admin's; this is the
// architect's own document).
router.post(
  "/upload",
  requireRole("project-manager", "admin", "it-designer", "site-personnel", "consultant", "architect"),
  advisoryDocumentUpload.single("file"),
  controller.upload,
);

// Changing a document (editing its details or removing it) is Admin only. Every
// other role can still upload new documents above, but cannot alter or delete one.
router.patch(
  "/:id",
  requireRole("admin"),
  validate(updateDocumentSchema),
  controller.update,
);

router.delete(
  "/:id",
  requireRole("admin"),
  controller.remove,
);

export default router;