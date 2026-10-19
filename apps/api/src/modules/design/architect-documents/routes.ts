// routes.ts
import { Router } from "express";
import { validate } from "../../../core/http/validate.js";
import {
  createArchitectDocumentSchema,
  updateArchitectDocumentSchema,
} from "./validators.js";
import * as controller from "./controller.js";
import { authenticate } from "../../../core/auth/middleware.js";

const router = Router();

router.use(authenticate);
router.get("/", controller.getAll);
router.post("/", validate(createArchitectDocumentSchema), controller.create);
router.get("/:id", controller.getById);
router.patch(
  "/:id",
  validate(updateArchitectDocumentSchema),
  controller.update,
);
router.delete("/:id", controller.remove);

export default router;
