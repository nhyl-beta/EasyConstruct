import type { Request, Response, NextFunction } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import * as service from "./service.js";
import { sendSuccess } from "../utils/response.js";

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.login(req.body);
    sendSuccess(res, result, 200, "Login successful");
  } catch (err) {
    next(err);
  }
};

export const logout = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const u = req.authUser!;
    await service.logout(u.id, u.email, u.name);
    sendSuccess(res, null, 200, "Signed out");
  } catch (err) {
    next(err);
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await service.requestPasswordReset(req.body);
    // Same response whether or not the address exists — see service.
    sendSuccess(
      res,
      null,
      200,
      "If that email is registered, a reset link has been sent.",
    );
  } catch (err) {
    next(err);
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await service.resetPassword(req.body);
    sendSuccess(res, null, 200, "Password updated");
  } catch (err) {
    next(err);
  }
};

export const initiateOwnerRecovery = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.initiateOwnerRecovery(
      req.authUser!.id,
      req.body.targetUserId,
    );
    sendSuccess(res, data, 200, `Recovery link emailed to ${data.to}`);
  } catch (err) {
    next(err);
  }
};

