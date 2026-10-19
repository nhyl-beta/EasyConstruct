import { NextFunction, Request, Response } from "express";
import { requestContext, runWithRequestContext } from "./request-context.js";

/** Requests slower than this are logged with the [SLOW] marker. */
export const SLOW_REQUEST_MS = 500;

/**
 * One line per request: method, route, status, duration (and X-Cache when a
 * cached read was involved). Also writes `Server-Timing: total;dur=…` (plus any
 * entries recorded with noteTiming) and `X-Cache: HIT|MISS|BYPASS` on the
 * response, just before the headers go out.
 *
 *   GET /api/projects 200 12.4ms
 *   [SLOW] GET /api/lifecycle/my-actions 200 913.2ms
 */
export function logger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  const elapsedMs = () => Number(process.hrtime.bigint() - start) / 1e6;

  const writeHead = res.writeHead;
  res.writeHead = function patchedWriteHead(this: Response, ...args: Parameters<Response["writeHead"]>) {
    if (!this.headersSent) {
      const ctx = requestContext();
      this.setHeader("Server-Timing", [`total;dur=${elapsedMs().toFixed(1)}`, ...(ctx?.timings ?? [])].join(", "));
      if (ctx?.cache) this.setHeader("X-Cache", ctx.cache);
    }
    return writeHead.apply(this, args);
  } as Response["writeHead"];

  res.on("finish", () => {
    const ms = elapsedMs();
    // The route template (…/projects/:id) keeps the log low-cardinality.
    const route = req.route?.path ? `${req.baseUrl}${req.route.path === "/" ? "" : req.route.path}` : req.originalUrl.split("?")[0];
    const cache = requestContext()?.cache;
    const line = `${req.method} ${route || "/"} ${res.statusCode} ${ms.toFixed(1)}ms${cache ? ` cache=${cache}` : ""}`;
    if (ms >= SLOW_REQUEST_MS) console.warn(`[SLOW] ${line}`);
    else console.log(line);
  });

  runWithRequestContext(next);
}
