import { Router } from 'express';
import * as controller from "./controller.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();
// Owner's capstone scope is "system oversight and audit-log viewing" and IT
// Designer's is "system monitoring"; this router is GET-only, so adding them
// grants read of the audit trail and nothing else.
router.use(authenticate, requireRole("admin", "owner", "it-designer"));
// Must precede nothing else here, but keep it above any future '/:id'.
router.get('/security-overview', controller.getSecurityOverview);
router.get('/facets', controller.getFacets);
router.get('/', controller.getAll);

export default router;
