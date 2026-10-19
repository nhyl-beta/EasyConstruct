import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../utils/response.js";
import { approvalsService } from "./service.js";
import { clampLimit } from "./merge.js";

export const approvalsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      // { items, total }: the badge shows `total`, not the length of the truncated list.
      sendSuccess(res, await approvalsService.list(clampLimit(req.query.limit)));
    } catch (err) {
      next(err);
    }
  },
};
