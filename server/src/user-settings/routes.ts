// server/src/user-settings/routes.ts, mounted at /api/me/settings (client demo change #8)
//
// A signed-in person's own settings, stored on the server so they apply to the daily overdue job. For now
// that is one switch: "Email me overdue reminders" (on by default; the in-app alert is sent either way).
import { NextFunction, Response, Router } from "express";
import { z } from "zod";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { UnauthorizedError } from "../utils/errors.js";
import { formatSuccess } from "../utils/response.js";
import { getEmailSetting, setEmailSetting } from "../jobs/overdue-repository.js";

const router = Router();
router.use(authenticate);

const updateSchema = z.object({ emailOverdueReminders: z.boolean({ error: "emailOverdueReminders must be true or false" }) });

const me = (req: AuthedRequest) => {
  if (!req.authUser) throw new UnauthorizedError("Not signed in");
  return req.authUser.id;
};

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(formatSuccess({ emailOverdueReminders: await getEmailSetting(me(req)) }, "Settings retrieved"));
  } catch (err) {
    next(err);
  }
});

router.patch("/", validate(updateSchema), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(formatSuccess({ emailOverdueReminders: await setEmailSetting(me(req), req.body.emailOverdueReminders) }, "Settings saved"));
  } catch (err) {
    next(err);
  }
});

export default router;
