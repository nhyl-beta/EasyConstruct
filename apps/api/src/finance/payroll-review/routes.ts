import { Router } from "express";

import * as controller from "./controller.js";
import { validate } from "../../middleware/validate.js";
import { decidePayrollBatchSchema } from "../validators/payroll-review-validators.js";

const router = Router();

router.get("/", controller.listPayrollBatches);
router.get("/:id", controller.getPayrollBatch);
router.post("/:id/decide", validate(decidePayrollBatchSchema), controller.decidePayrollBatch);

export default router;
