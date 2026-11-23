import { Router } from "express";
import multer from "multer";

import { proposalController } from "./controller.js";

import {
  createProposalSchema,
  updateProposalSchema,
  reviewProposalSchema,
} from "./validators.js";

import { PROPOSAL_VALIDATE_ROLES } from "./validation.js";
import { validate } from "../../../core/http/validate.js";
import { authenticate, requireRole } from "../../../core/auth/middleware.js";
import { ValidationError } from "../../../core/utils/errors.js";

const router = Router();

// The Bill of Materials sheet is read straight from memory and parsed —
// never trusted from client-echoed JSON. See boq-import.ts.
const boqUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/\.xlsx$/i.test(file.originalname)) {
      return cb(new ValidationError("Upload an Excel workbook (.xlsx). Start from the template if you're unsure."));
    }
    cb(null, true);
  },
});

router.use(authenticate);

// Reading the register is open to every authenticated role — Owner and IT
// Designer oversee it, Architect authors into it, Consultant decides on it.
// Writing was open too: every route below was authenticated only, so any
// signed-in account could create, edit, decide on or delete a proposal.
// Authoring belongs to Architect and deciding to Consultant; admin is kept
// on both as the break-glass role. IT Designer is deliberately absent — its
// screen is read-only oversight (pages/roles/it-designer/it-designer-proposals).
const canAuthor = requireRole("architect", "admin");
const canReview = requireRole("consultant", "admin");

router.get(
  "/",
  proposalController.getAll,
);

router.post(
  "/",
  canAuthor,
  validate(createProposalSchema),
  proposalController.create,
);

// D2: creates the proposal AND opens its Design Proposal Approval workflow
// in one call, linking them (proposals.workflow_id) — see
// proposals/service.ts submit(). Kept alongside plain POST "/" above rather
// than replacing it: POST "/" still works for anything that doesn't want a
// workflow opened.
router.post(
  "/submit",
  canAuthor,
  boqUpload.single("file"),
  validate(createProposalSchema),
  proposalController.submit,
);

// Declared before "/:id" so "boq-template" and "boq" aren't read as ids.
router.get("/boq-template", proposalController.boqTemplate);
router.post("/boq/preview", canAuthor, boqUpload.single("file"), proposalController.boqPreview);

router.get(
  "/:id",
  proposalController.getById,
);

// B1: the files the Architect submitted with this proposal.
router.get(
  "/:id/files",
  proposalController.files,
);

router.patch(
  "/:id",
  canAuthor,
  validate(updateProposalSchema),
  proposalController.update,
);

// J: compute (and store) the rule-based validation summary on demand when a
// proposal has none. Never changes the proposal status.
router.post(
  "/:id/validate",
  requireRole(...PROPOSAL_VALIDATE_ROLES),
  proposalController.validate,
);

router.patch(
  "/:id/review",
  canReview,
  validate(reviewProposalSchema),
  proposalController.review,
);

router.delete(
  "/:id",
  canAuthor,
  proposalController.remove,
);

export default router;