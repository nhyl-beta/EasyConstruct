// Tiny controller plumbing shared by the three purchasing modules.
import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../utils/response.js";
import { actorOf, type Actor } from "./access.js";

type Result = { data: unknown; status?: number; message?: string };

/** Runs `fn(actor, req)`, sends `{ success, message, data }` and forwards errors. */
export const handle =
  (fn: (actor: Actor, req: Request) => Promise<Result>) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const r = await fn(actorOf(req), req);
      return sendSuccess(res, r.data, r.status ?? 200, r.message ?? "OK");
    } catch (err) {
      return next(err);
    }
  };

export const idParam = (req: Request): string => String(req.params.id);
