import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../../core/utils/response.js";
import { clientPaymentsService } from "./service.js";
import { scopedProjectCodes } from "../../projects/index.js";
import type { AuthedRequest } from "../../../core/auth/middleware.js";

export const clientPaymentsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      // A Project Manager only sees the payments of the projects they manage.
      const codes = (await scopedProjectCodes((req as AuthedRequest).authUser)) ?? undefined;
      return sendSuccess(res, await clientPaymentsService.list(codes), 200, "Payments retrieved successfully");
    } catch (err) {
      return next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await clientPaymentsService.create(req.body, (req as AuthedRequest).authUser?.name ?? null);
      return sendSuccess(res, data, 201, "Payment recorded successfully");
    } catch (err) {
      return next(err);
    }
  },
};
