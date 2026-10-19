import { Router } from "express";
import * as controller from "./controller.js";
import { authenticate, requireRole } from "../../../core/auth/middleware.js";

const router = Router();

// GET-only router (the roles catalogue is seeded, never edited over HTTP; permissions are enforced
// by requireRole() on each route and the client resource map, not by a table).
// IT Designer needs it to pick a role when creating/editing an account;
// Owner needs it for the read-only "who can do what" side of oversight.
router.use(authenticate, requireRole("admin", "owner", "it-designer"));

router.get("/", controller.getAll);
// Before "/:id" so "summary" is not read as an id.
router.get("/summary", controller.getAccountSummary);
router.get("/:id", controller.getById);

export default router;
