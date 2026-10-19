import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";

/**
 * Tags every response with an X-Request-ID (the caller's own, when it sent a
 * sane one) so a slow or failed request can be traced from the browser to the
 * server log. Request timing is logged by middleware/logger.ts.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get("x-request-id");
  res.setHeader("X-Request-ID", incoming && /^[\w.-]{1,64}$/.test(incoming) ? incoming : randomUUID());
  next();
}
