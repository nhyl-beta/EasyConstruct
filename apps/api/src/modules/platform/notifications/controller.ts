import { NextFunction, Response } from "express";
import { MSG } from "../../../core/config/messages.js";
import { formatSuccess } from "../../../core/utils/response.js";
import { UnauthorizedError } from "../../../core/utils/errors.js";
import { parseIdParam } from "../../../core/utils/params.js";
import type { AuthedRequest } from "../../../core/auth/middleware.js";
import * as service from "./service.js";
import * as stream from "./stream.js";

export const getAll = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.authUser) throw new UnauthorizedError();
    // Always the caller's own inbox — ?role= is ignored on purpose (see
    // notifications/repository.ts findForRecipient).
    const data = await service.getForRecipient(
      { userId: req.authUser.id, role: req.authUser.role },
      { unreadOnly: req.query.unreadOnly === "true" },
    );
    res.json(formatSuccess(data, MSG.notifications.retrieved));
  } catch (err) { next(err); }
};

export const markRead = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.authUser) throw new UnauthorizedError();
    const data = await service.markRead(parseIdParam(req.params.id), { userId: req.authUser.id, role: req.authUser.role });
    res.json(formatSuccess(data, MSG.notifications.updated));
  } catch (err) { next(err); }
};

// C1: pushes new notifications to the caller as they're created, instead of
// only on the next bell-popover-open refetch. One long-lived connection per
// tab; the browser's native EventSource handles reconnect on its own.
export const stream_ = (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.authUser) throw new UnauthorizedError();
    const userId = req.authUser.id;

    stream.open(userId, res, req);
  } catch (err) { next(err); }
};