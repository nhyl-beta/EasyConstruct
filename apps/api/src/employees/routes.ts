import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from "../validators/employee-validators.js";

const router = Router();

router.use(authenticate);

router.get("/me", controller.getMe);          
router.get("/", controller.getAll);
router.post("/", validate(createEmployeeSchema), controller.create);
router.get("/:id", controller.getById);
router.patch("/:id", validate(updateEmployeeSchema), controller.update);
router.patch("/:id/deactivate", controller.deactivate);
router.delete("/:id", controller.remove);

export default router;