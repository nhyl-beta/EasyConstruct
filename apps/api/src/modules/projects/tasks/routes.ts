import { Router } from "express";
import * as controller from "./controller.js";
import { validate, validateQuery } from "../../../core/http/validate.js";
import { authenticate, requireRole } from "../../../core/auth/middleware.js";
import { assignmentWarningsQuerySchema, suggestAllocationSchema, suggestAssigneesQuerySchema, createTaskSchema, updateTaskSchema, updateTaskStatusSchema } from "./validators.js";

const router = Router();

router.use(authenticate);

router.get("/", controller.getAll);
router.get("/progress", controller.getProgress);
// Decision support: read-only advice, registered before "/:id".
router.get("/suggest-assignees", requireRole("project-manager", "engineer"), validateQuery(suggestAssigneesQuerySchema), controller.suggestAssignees);
router.get("/assignment-warnings", requireRole("project-manager", "engineer"), validateQuery(assignmentWarningsQuerySchema), controller.assignmentWarnings);
router.post("/suggest-allocation", requireRole("project-manager", "engineer"), validate(suggestAllocationSchema), controller.suggestAllocation);
router.get("/:id", controller.getById);
router.post("/", requireRole("project-manager", "engineer"), validate(createTaskSchema), controller.create);
router.patch("/:id/status", requireRole("site-personnel"), validate(updateTaskStatusSchema), controller.updateStatus);
router.patch("/:id", requireRole("project-manager", "engineer"), validate(updateTaskSchema), controller.update);
router.delete("/:id", requireRole("project-manager"), controller.remove);

export default router;