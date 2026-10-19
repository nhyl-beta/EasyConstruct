// routes.ts
import { Router } from 'express';
import * as controller from "./controller.js";
import { validate } from "../../middleware/validate.js";
import { createDesignRevisionSchema, updateDesignRevisionSchema } from "../../validators/design-revision-validator.js";
import { authenticate, requireRole } from '../../middleware/auth.js';

const router = Router();

router.use(authenticate);
// Reads are scoped to the projects the caller may see (controller + service).
router.get('/', controller.getAll);
// Explicit, admin-only demo generation (refused in production unless ALLOW_DEMO_SEED=true). Before '/:id'.
router.post('/demo', requireRole("admin"), controller.generateDemo);
router.get('/:id', controller.getById);
// Writing a design's revision history belongs to the Architect (Admin as break-glass).
router.post('/', requireRole("architect", "admin"), validate(createDesignRevisionSchema), controller.create);
router.patch('/:id', requireRole("architect", "admin"), validate(updateDesignRevisionSchema), controller.update);
router.delete('/:id', requireRole("architect", "admin"), controller.remove);

export default router;
