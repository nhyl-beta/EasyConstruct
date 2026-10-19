import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../utils/response.js";
import { cashFlowRepository } from "./repository.js";

export const cashFlowController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const months = req.query.months ? Number(req.query.months) : 6;
      const data = await cashFlowRepository.findRecent(months);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
};
