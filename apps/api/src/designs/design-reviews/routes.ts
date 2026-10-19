import { Router } from 'express';
import * as controller from "./controller.js";
import { validate } from "../../middleware/validate.js";
import { createDesignReviewSchema, decideDesignReviewSchema } from "../../validators/design-review-validator.js";
import { authenticate, requireRole } from '../../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.get('/', controller.getAll);
router.post('/', validate(createDesignReviewSchema), controller.create);
router.get('/:id', controller.getById);
// E1: deciding a review (Approved/Rejected/Changes Requested) is the
// Consultant's or PM's call — it wasn't gated at all before, so anyone
// signed in could decide a review that wasn't theirs to decide.
router.post(
  '/:id/decide',
  requireRole("consultant", "project-manager", "admin"),
  validate(decideDesignReviewSchema),
  controller.decide,
);
router.delete('/:id', controller.remove);

export default router;