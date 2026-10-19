// apps/api/src/transmittals/routes.ts — mounted at /api/transmittals
import { Router } from "express";
import { authenticate, requireRole } from "../core/auth/middleware.js";
import { validate } from "../core/http/validate.js";
import {
  acknowledgeTransmittalSchema,
  createTransmittalSchema,
  updateTransmittalSchema,
} from "../validators/design-request-validators.js";
import * as controller from "./controller.js";

const router = Router();
router.use(authenticate);

router.get("/", controller.list);
router.get("/:id", controller.getById);

const writers = requireRole("project-manager", "engineer", "architect", "admin");
router.post("/", writers, validate(createTransmittalSchema), controller.create);
router.patch("/:id", writers, validate(updateTransmittalSchema), controller.update);
router.post("/:id/issue", writers, controller.issue);
router.post("/:id/acknowledgements", writers, validate(acknowledgeTransmittalSchema), controller.acknowledge);

export default router;
