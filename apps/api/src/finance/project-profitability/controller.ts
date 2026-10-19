import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../utils/response.js";
import { projectProfitabilityRepository } from "./repository.js";

export const projectProfitabilityController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await projectProfitabilityRepository.compute();
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
};
