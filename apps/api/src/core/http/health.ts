import type { Request, Response } from "express";

// GET /api/health: liveness only. No database, cache or auth, so a slow dependency never fails the probe.
export const healthHandler = (_req: Request, res: Response): void => {
  res.status(200).json({ ok: true });
};

// GET /api/health/ready: for uptime monitors. 503 when the database does not answer within 5 seconds,
// which /api/health (liveness only) cannot show. `ping` is passed in so the test needs no database.
export const readyHandler = (ping: () => Promise<unknown>) => async (_req: Request, res: Response): Promise<void> => {
  const timer = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5_000).unref());
  try {
    await Promise.race([ping(), timer]);
    res.status(200).json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
};
