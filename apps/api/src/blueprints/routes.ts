// routes.ts
import { Router } from 'express';
import * as controller from "./controller.js";
import { validate } from "../middleware/validate.js";
import { createBlueprintSchema, updateBlueprintSchema, decideBlueprintSchema } from "../validators/blueprint-validator.js";
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.get('/', controller.getAll);
router.post('/', validate(createBlueprintSchema), controller.create);
router.get('/:id', controller.getById);
router.patch('/:id', validate(updateBlueprintSchema), controller.update);
// Part B item 8: a role-gated decision action, separate from the generic
// PATCH above — the architect who authored a blueprint can still edit its
// metadata via PATCH, but only Consultant/PM/Admin can decide its approval
// (mirrors design-reviews' architect-authors/consultant-decides split).
router.post('/:id/decide', requireRole("consultant", "project-manager", "admin"), validate(decideBlueprintSchema), controller.decide);
router.delete('/:id', controller.remove);

export default router;