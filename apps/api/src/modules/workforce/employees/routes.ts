import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../../../core/http/validate.js";
import { authenticate, requireRole } from "../../../core/auth/middleware.js";
import * as documents from "./documents.js";
import * as departments from "./departments.js";
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
// Name lookup for Quick attendance entry (Site Personnel can't read the full
// list) — before "/:id" for the same reason as "/me".
router.get("/lookup", requireRole("site-personnel", "human-resources", "finance-manager", "admin", "it-designer"), controller.lookup);
// Department list (before "/:id"). Reads: same roles as the employee list; writes: HR.
router.get("/departments", canReadEmployees, departments.list);
router.get("/documents", requireRole("human-resources", "admin"), documents.listAll);
router.post("/departments", canWriteEmployees, validate(departments.createDepartmentSchema), departments.create);
router.delete("/departments/:id", canWriteEmployees, departments.remove);
router.get("/", canReadEmployees, controller.getAll);
router.post("/", canWriteEmployees, validate(createEmployeeSchema), controller.create);
router.get("/:id", canReadEmployees, controller.getById);
router.get("/:id/history", canReadEmployees, controller.getHistory);
router.patch("/:id", canWriteEmployees, validate(updateEmployeeSchema), controller.update);
router.patch("/:id/deactivate", canWriteEmployees, controller.deactivate);
router.delete("/:id", canWriteEmployees, controller.remove);
// B-111: resume, CV, certificates and other files HR keeps on an employee.
// Personal files: HR writes, Admin reads.
router.get("/:id/documents", requireRole("human-resources", "admin"), documents.list);
router.post("/:id/documents", canWriteEmployees, validate(documents.createDocumentSchema), documents.create);
router.delete("/:id/documents/:docId", canWriteEmployees, documents.remove);

export default router;