import { ForbiddenError, ValidationError } from "../../utils/errors.js";
import { handle } from "../purchasing/http.js";
import { categoriesService as service } from "./service.js";

const idOf = (raw: unknown): number => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid category id");
  return id;
};

export const categoriesController = {
  list: handle(async (actor, req) => {
    const withUsage = req.query.withUsage === "true";
    // Usage counts reveal other modules' volumes: Finance and Admin only.
    if (withUsage && actor.role !== "finance-manager" && actor.role !== "admin") {
      throw new ForbiddenError("Only Finance can see category usage");
    }
    return {
      data: await service.list({ activeOnly: req.query.active === "true", withUsage }),
      message: "Expense categories retrieved",
    };
  }),
  create: handle(async (actor, req) => ({ data: await service.create(actor, req.body), status: 201, message: "Category added" })),
  update: handle(async (actor, req) => ({ data: await service.update(actor, idOf(req.params.id), req.body), message: "Category updated" })),
  retire: handle(async (actor, req) => ({ data: await service.retire(actor, idOf(req.params.id)), message: "Category retired" })),
  restore: handle(async (actor, req) => ({ data: await service.restore(actor, idOf(req.params.id)), message: "Category restored" })),
};
