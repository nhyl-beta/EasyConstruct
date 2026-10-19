import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  generatePayrollSchema,
  payrollEntrySchema,
  submitBatchSchema,
  updatePayrollLineSchema,
} from "../validators/payroll-validators.js";

const router = Router();

router.use(authenticate);

// Finance reads payroll but never changes a line; HR (plus admin and
// it-designer) builds and edits it.
const canRead = requireRole("human-resources", "finance-manager", "admin", "it-designer");
const canWrite = requireRole("human-resources", "admin", "it-designer");

// Owner dashboard summary: aggregates of approved payroll, read-only. This is
// the only payroll route the owner role can reach. Before "/:id".
router.get(
  "/owner-summary",
  requireRole("owner", "admin", "it-designer"),
  controller.getOwnerSummary,
);

// Tracksheet
router.get("/", canRead, controller.getAll);
// Fix 2.8: before "/:id".
router.get("/rules", canRead, controller.getRulesSummary);

// G5: prefill for Generate — verified attendance summed per employee. Must
// come before "/:id" or Express would match "attendance-summary" as an id.
router.get("/attendance-summary", canWrite, controller.getAttendanceSummary);

router.get("/attendance-readiness", canWrite, controller.getAttendanceReadiness);

// Generate → draft batch with server-computed lines
router.post("/generate", canWrite, validate(generatePayrollSchema), controller.generate);

// Batches — all before "/:id".
router.get("/batches/all", canRead, controller.listBatches);
router.get("/batches/:id", canRead, controller.getBatch);
router.get("/batches/:id/validation", canWrite, controller.getBatchValidation);
router.post("/batches/:id/lines", canWrite, validate(payrollEntrySchema), controller.addLine);
router.post("/batches/:id/submit", canWrite, validate(submitBatchSchema), controller.submitBatch);
router.delete("/batches/:id", canWrite, controller.removeBatch);

// Contribution reports per agency and period (employee + employer share)
router.get("/reports/contributions", canRead, controller.contributionReport);

router.get("/:id/trace", canRead, controller.getLineTrace);
router.get("/:id", canRead, controller.getById);
router.patch("/:id", canWrite, validate(updatePayrollLineSchema), controller.update);
router.delete("/:id", canWrite, controller.remove);

export default router;
