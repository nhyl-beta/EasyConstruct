// apps/api/src/uploads/routes.ts — NEW
import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import type { NextFunction, Request, Response } from "express";
import { uploadSchema } from "../validators/upload-validators.js";
import { streamUpload } from "./stream.js";
import { formatLimit, maxUploadBytes } from "./limits.js";
import { ValidationError } from "../utils/errors.js";

const router = Router();

// Vercel Blob calls this route back with no login when a browser's direct upload has finished. That one
// event type is let through here; handleUpload() itself refuses it unless Vercel's signature (made with the
// store token) is valid. Every other request to the route still needs a signed-in user.
router.post("/client-token", (req: Request, res: Response, next: NextFunction) =>
  req.body?.type === "blob.upload-completed" ? controller.clientToken(req, res, next) : authenticate(req, res, next),
  controller.clientToken,
);

router.use(authenticate);
router.get("/file", controller.download);
router.post("/verify", controller.verify);
router.post("/integrity", controller.integrityStatuses);
router.get("/config", controller.config);
// Large files: multipart streamed to disk (no Blob store), or a Blob client token.
router.post(
  "/stream",
  (req, res, next) =>
    streamUpload()(req, res, (err: unknown) => {
      if (err && (err as { code?: string }).code === "LIMIT_FILE_SIZE") {
        return next(new ValidationError(`File exceeds the ${formatLimit(maxUploadBytes())} upload limit`));
      }
      next(err);
    }),
  controller.uploadStreamed,
);
router.post("/", validate(uploadSchema), controller.upload);

export default router;