import { Router } from "express";
import { requireRole } from "../../../core/auth/middleware.js";
import { validate } from "../../../core/http/validate.js";
import { createCategorySchema, updateCategorySchema } from "./validators.js";
import { categoriesController as c } from "./controller.js";

// /api/finance only requires authenticate, so every route names its roles.
export const categoriesRouter = Router();

// Anyone who fills in a category dropdown may read the list.
categoriesRouter.get(
  "/",
  requireRole("finance-manager", "admin", "project-manager", "engineer", "site-personnel", "architect", "human-resources"),
  c.list,
);

categoriesRouter.post("/", requireRole("finance-manager"), validate(createCategorySchema), c.create);
categoriesRouter.patch("/:id", requireRole("finance-manager"), validate(updateCategorySchema), c.update);
categoriesRouter.post("/:id/retire", requireRole("finance-manager"), c.retire);
categoriesRouter.post("/:id/restore", requireRole("finance-manager"), c.restore);
