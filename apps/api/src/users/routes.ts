import { Router } from "express";
import * as controller from "./controller.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createUserSchema,
  setUserPasswordSchema,
  setUserStatusSchema,
  updateUserSchema,
} from "../validators/user-validators.js";

const router = Router();

router.use(authenticate);

// GET stays open to every authenticated role: it is the cross-role user
// picker (PM staffing, engineer assignment) and returns no sensitive columns.
router.get("/", controller.getAll);

// Account management is IT Designer's core scope in the capstone
// ("create/edit/deactivate accounts, assign permissions"). Admin and Super
// Admin are included because every other administrative write route in this
// codebase includes them. Owner is deliberately absent — its scope is
// read-only executive oversight, so it must not be able to mint accounts.
const canManageAccounts = requireRole("admin", "it-designer");

router.post("/", canManageAccounts, validate(createUserSchema), controller.create);
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
