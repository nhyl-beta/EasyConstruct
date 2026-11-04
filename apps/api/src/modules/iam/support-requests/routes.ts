import { Router } from "express";
import type { NextFunction, Response } from "express";
import { z } from "zod";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";

import { authenticate, requireRole, type AuthedRequest } from "../../../core/auth/middleware.js";
import { validate } from "../../../core/http/validate.js";
import { db } from "../../../core/db/connection.js";
import { supportRequests } from "../../../core/db/schema/support-requests.js";
import { logAudit } from "../../../core/audit/audit.js";
import { HTTP } from "../../../core/config/http-status.js";
import { NotFoundError } from "../../../core/utils/errors.js";
import { parseIdParam } from "../../../core/utils/params.js";
import { formatSuccess, parsePageRequest, paginate, sendPaged } from "../../../core/utils/pagination.js";

// User Support: any signed-in user except IT files an account-related request and sees only their own. IT Designer
// alone sees the whole inbox and answers requests (account changes are IT-only everywhere - see iam/users/routes.ts).
// Admin has no access to other people's requests.
export const SUPPORT_CATEGORIES = ["password_reset", "email_name_change", "role_access", "cannot_sign_in", "other_account"] as const;
export const SUPPORT_STATUSES = ["open", "in_progress", "resolved", "declined"] as const;

const createSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z.string().trim().min(3, "Enter a short subject").max(150),
  details: z.string().trim().min(5, "Describe what you need").max(2000),
});

const updateSchema = z
  .object({
    status: z.enum(SUPPORT_STATUSES),
    resolutionNote: z.string().trim().max(2000).optional(),
  })
  // IT's answer is what the requester reads: closing a request needs one.
  .refine((v) => (v.status !== "resolved" && v.status !== "declined") || !!v.resolutionNote, {
    message: "Write a reply before resolving or declining",
    path: ["resolutionNote"],
  });

const SEES_ALL = ["it-designer"];

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.authUser!;
    const conditions: SQL[] = [];
    if (!SEES_ALL.includes(user.role)) conditions.push(eq(supportRequests.requesterUserId, user.id));
    const status = typeof req.query.status === "string" ? req.query.status : "";
    if ((SUPPORT_STATUSES as readonly string[]).includes(status)) conditions.push(eq(supportRequests.status, status));
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      const term = `%${search}%`;
      conditions.push(or(ilike(supportRequests.subject, term), ilike(supportRequests.requesterName, term))!);
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const paging = parsePageRequest({ limit: "10", ...req.query }, { enforce: true });
    const { items, meta } = await paginate(
      paging,
      async () => (await db.select({ n: count() }).from(supportRequests).where(where))[0]?.n ?? 0,
      ({ limit, offset }) => db.select().from(supportRequests).where(where).orderBy(desc(supportRequests.createdAt), desc(supportRequests.id)).limit(limit).offset(offset),
    );
    sendPaged(res, items, "Support requests retrieved", meta);
  } catch (err) {
    next(err);
  }
});

// IT Designer answers requests rather than sending them.
router.post("/", requireRole("admin", "owner", "project-manager", "human-resources", "finance-manager", "architect", "engineer", "site-personnel", "consultant"), validate(createSchema), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.authUser!;
    const [created] = await db
      .insert(supportRequests)
      .values({ ...req.body, requesterUserId: user.id, requesterName: user.name, requesterRole: user.role })
      .returning();
    await logAudit({
      entityType: "support_request",
      entityId: String(created!.id),
      action: "created",
      actor: user.name,
      summary: `Support request: ${created!.subject}`,
    });
    res.status(HTTP.CREATED).json(formatSuccess(created, "Request sent to IT"));
  } catch (err) {
    next(err);
  }
});

// Only IT Designer handles a request.
router.patch("/:id", requireRole("it-designer"), validate(updateSchema), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseIdParam(req.params.id, "id");
    const actor = req.authUser!.name;
    const done = req.body.status === "resolved" || req.body.status === "declined";
    const [updated] = await db
      .update(supportRequests)
      .set({
        status: req.body.status,
        resolutionNote: req.body.resolutionNote ?? null,
        handledBy: actor,
        handledAt: done ? new Date() : null,
      })
      .where(eq(supportRequests.id, id))
      .returning();
    if (!updated) throw new NotFoundError("Support request", String(id));
    await logAudit({
      entityType: "support_request",
      entityId: String(id),
      action: "updated",
      actor,
      summary: `Support request #${id} marked ${updated.status}`,
    });
    res.json(formatSuccess(updated, "Request updated"));
  } catch (err) {
    next(err);
  }
});

export default router;
