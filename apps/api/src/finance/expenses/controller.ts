import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../utils/response.js";
import { expensesService } from "./services.js";
import { parsePageRequest, sendPaged } from "../../utils/pagination.js";
import { EXPENSE_SORT_COLUMNS } from "./repository.js";
import { scopedProjectCodes } from "../../projects/service.js";
import type { AuthedRequest } from "../../middleware/auth.js";

export const expensesController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { query, category } = req.query;

      // Always windowed (this list was already capped at one page of 20 rows),
      // now with its total in `meta` and a sort whitelist.
      const paging = parsePageRequest(req.query, { enforce: true, sortable: Object.keys(EXPENSE_SORT_COLUMNS) });
      const { items, meta } = await expensesService.listPage(
        {
          query: query as string | undefined,
          category: category as string | undefined,
          // A Project Manager only sees the expenses of the projects they manage.
          codes: (await scopedProjectCodes((req as AuthedRequest).authUser)) ?? undefined,
        },
        paging,
        req.query.extras === "1",
      );

      return sendPaged(res, items, "Expenses retrieved successfully", meta);
    } catch (err) {
      return next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await expensesService.create(req.body);

      return sendSuccess(res, data, 201, "Expense created successfully");
    } catch (err) {
      return next(err);
    }
  },

  async rescore(_req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await expensesService.rescoreAll(), 200, "Expenses re-scored");
    } catch (err) {
      return next(err);
    }
  },

  async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await expensesService.approve(req.params.id as string);

      return sendSuccess(res, data, 200, data.warning ?? "Expense approved successfully");
    } catch (err) {
      return next(err);
    }
  },

  async reject(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await expensesService.reject(req.params.id as string);

      return sendSuccess(res, data, 200, "Expense rejected successfully");
    } catch (err) {
      return next(err);
    }
  },
};
