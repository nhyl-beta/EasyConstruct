import { Router } from "express";
import * as controller from "./controller.js";
import { authenticate, requireRole } from "../../../core/auth/middleware.js";
import { validate } from "../../../core/http/validate.js";
import {
  createUserSchema,
  linkEmployeeSchema,
  setUserPasswordSchema,
  setUserStatusSchema,
  updateUserSchema,
} from "./validators.js";

const router = Router();

router.use(authenticate);

// GET stays open to every authenticated role: it is the cross-role user
// picker (PM staffing, engineer assignment) and returns no sensitive columns.
router.get("/", controller.getAll);

// Account management is IT Designer's core scope in the capstone
// ("create/edit/deactivate accounts, assign permissions"). Admin runs the project
// portfolio but does not manage accounts: it keeps the open read above (the user
// picker) and nothing else here. Owner is deliberately absent too — its scope is
// read-only executive oversight, so it must not be able to mint accounts.
// canReadUsers is the unrestricted GET above (any signed-in role).
const canManageAccounts = requireRole("it-designer");

router.get("/linkable-employees", canManageAccounts, controller.getLinkableEmployees);
router.post("/", canManageAccounts, validate(createUserSchema), controller.create);
// Part 2: tie an account that predates the strict link to an employee record.
router.post("/:id/link-employee", canManageAccounts, validate(linkEmployeeSchema), controller.linkEmployee);
router.post("/:id/create-employee", canManageAccounts, controller.createEmployeeFromAccount);
router.patch("/:id", canManageAccounts, validate(updateUserSchema), controller.update);
router.patch(
  "/:id/status",
  canManageAccounts,
  validate(setUserStatusSchema),
  controller.setStatus,
);

// Administrative password reset. Same gate as the rest of account management:
// the account holder's own route is POST /api/auth/forgot-password.
router.patch(
  "/:id/password",
  canManageAccounts,
  validate(setUserPasswordSchema),
  controller.setPassword,
);

// Permanent removal. Guarded in users/service.ts: the account must already
// be deactivated, must not be the caller's own, and must have no employee
// record, project assignment, or assigned task still pointing at it.
router.delete("/:id", canManageAccounts, controller.remove);

export default router;
