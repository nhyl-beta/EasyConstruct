import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../../../core/http/validate.js";
import { authenticate, requireRole } from "../../../core/auth/middleware.js";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from "./employee-validators.js";

const router = Router();

router.use(authenticate);

// Employee records are HR data. Reads: the roles whose screens load the list (HR: employees, payroll and
// attendance pages; Finance: budget owner-department picker; Admin and IT Designer: read-only views and the
// staffing-gaps card). Writes: Human Resources only. GET /me stays open to any signed-in user.
const canReadEmployees = requireRole("human-resources", "finance-manager", "admin", "it-designer");
const canWriteEmployees = requireRole("human-resources");

router.get("/me", controller.getMe);
router.get("/", canReadEmployees, controller.getAll);
router.post("/", canWriteEmployees, validate(createEmployeeSchema), controller.create);
router.get("/:id", canReadEmployees, controller.getById);
router.patch("/:id", canWriteEmployees, validate(updateEmployeeSchema), controller.update);
router.patch("/:id/deactivate", canWriteEmployees, controller.deactivate);
router.delete("/:id", canWriteEmployees, controller.remove);

export default router;