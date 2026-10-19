import { Router } from 'express';
import * as controller from "./controller.js";
import { authenticate } from "../../../core/auth/middleware.js";

const router = Router();
router.use(authenticate);
router.get('/', controller.getAll);
router.get('/stream', controller.stream_);
// There is deliberately no POST /: notifications are created by server code only
// (notifications/service.ts create / notifyProject). A public route let any signed-in user
// put a message with a link into another role's feed.
router.patch('/:id/read', controller.markRead);

export default router;