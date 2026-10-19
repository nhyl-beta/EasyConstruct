import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../utils/response.js";
import { summaryRepository } from "./repository.js";

export const summaryController = {
  async get(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await summaryRepository.compute();
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
};
