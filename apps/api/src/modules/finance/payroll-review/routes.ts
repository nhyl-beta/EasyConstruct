import { Router } from "express";

import * as controller from "./controller.js";
import { validate } from "../../../core/http/validate.js";
import { requireRole } from "../../../core/auth/middleware.js";
import { decidePayrollBatchSchema } from "./validators.js";

const router = Router();

router.get("/", controller.listPayrollBatches);
router.get("/:id", controller.getPayrollBatch);
// The mount lets Finance, Admin and IT Designer read; deciding a batch is Finance Manager (and IT Designer, unchanged). Admin is read-only.
router.post("/:id/decide", requireRole("finance-manager", "it-designer"), validate(decidePayrollBatchSchema), controller.decidePayrollBatch);

export default router;
