// server/src/me/routes.ts (objectives fix 2.5), mounted at /api/me. Read-only, own records only.
import { NextFunction, Response, Router } from "express";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";
import { formatSuccess } from "../utils/response.js";
import { byDate, byString, respondList } from "../utils/pagination.js";
import * as service from "./service.js";

const router = Router();
router.use(authenticate);

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap = (fn: Handler) => async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

router.get(
  "/employee",
  wrap(async (req, res) => {
    res.json(formatSuccess(await service.getMyEmployee(req.authUser!.id), "Employee link"));
  }),
);

router.get(
  "/attendance",
  wrap(async (req, res) => {
    const q = req.query;
    const rows = await service.getMyAttendance(
      req.authUser!.id,
      typeof q.dateFrom === "string" ? q.dateFrom : undefined,
      typeof q.dateTo === "string" ? q.dateTo : undefined,
    );
    respondList(res, q, rows, "Your attendance", {
      logDate: byDate((r: (typeof rows)[number]) => r.logDate),
      attendanceStatus: byString((r: (typeof rows)[number]) => r.attendanceStatus),
    });
  }),
);

// Approved batches only: a payslip exists once Finance has approved the batch.
router.get(
  "/payslips",
  wrap(async (req, res) => {
    const rows = await service.getMyPayslips(req.authUser!.id);
    respondList(res, req.query, rows, "Your payslips", {
      period: byString((r: (typeof rows)[number]) => r.period),
      net: (a: (typeof rows)[number], b: (typeof rows)[number]) => a.net - b.net,
    });
  }),
);

export default router;
