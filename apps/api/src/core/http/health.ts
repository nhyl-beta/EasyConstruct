import type { Request, Response } from "express";

// GET /api/health: liveness only. No database, cache or auth, so a slow dependency never fails the probe.
export const healthHandler = (_req: Request, res: Response): void => {
  res.status(200).json({ ok: true });
};
