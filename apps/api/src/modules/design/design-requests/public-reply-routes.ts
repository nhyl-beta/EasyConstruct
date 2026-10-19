// apps/api/src/design-requests/public-reply-routes.ts, mounted at /api/public/rfi-replies (client demo change #6)
//
// The only unauthenticated routes this feature adds. Everything is decided by the single-use token in the
// path, nothing is returned beyond what the recipient needs, and each address is rate limited.
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { z } from "zod";
import { hitLimiter } from "../../../core/auth/throttle.js";
import { AppError, ValidationError } from "../../../core/utils/errors.js";
import { formatSuccess } from "../../../core/utils/response.js";
import * as publicReply from "./public-reply.js";

const router = Router();

const callerOf = (req: Request): publicReply.Caller => {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return { ip: (first || req.ip || "unknown").slice(0, 64) };
};

// Per address, per server instance (held in memory). It slows bulk guessing and form spam from one address;
// the 256-bit token is what actually makes a link impossible to guess.
const readHits = new Map<string, number[]>();
const writeHits = new Map<string, number[]>();
const limit = (hits: Map<string, number[]>, max: number, windowMs: number) => (req: Request, _res: Response, next: NextFunction) => {
  if (hitLimiter(hits, callerOf(req).ip, Date.now(), max, windowMs)) return next();
  next(new AppError(429, "RATE_LIMITED", "Too many attempts from this address. Please wait a few minutes and try again."));
};

/** Resets the limiter state (tests). */
export const resetPublicReplyLimits = () => {
  readHits.clear();
  writeHits.clear();
};

const upload = multer({
  storage: multer.memoryStorage(),
  // The real limits are checked in the service with friendly messages; these are the hard ceiling.
  limits: { fileSize: 50 * 1024 * 1024, files: 10, fields: 10, fieldSize: 64 * 1024 },
}).array("files", 10);

const formSchema = z.object({ answer: z.string().max(20_000), name: z.string().max(200), position: z.string().max(200) });

const parseUpload = (req: Request, res: Response, next: NextFunction) =>
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as { code?: string }).code;
    if (code === "LIMIT_FILE_SIZE") return next(new ValidationError("One of the files is too large."));
    if (code === "LIMIT_FILE_COUNT" || code === "LIMIT_UNEXPECTED_FILE") return next(new ValidationError("Too many files were attached."));
    next(new ValidationError("The form could not be read. Please try again."));
  });

// Open the request: 60 per minute per address.
router.get("/:token", limit(readHits, 60, 60_000), async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(formatSuccess(await publicReply.openReply(String(req.params.token), callerOf(req)), "Request retrieved"));
  } catch (err) {
    next(err);
  }
});

// An attachment of the request, opened with the token.
router.get("/:token/files/:fileId", limit(readHits, 60, 60_000), async (req, res, next) => {
  try {
    const fileId = Number(req.params.fileId);
    if (!Number.isInteger(fileId) || fileId <= 0) throw new ValidationError("Not a valid file.");
    const { file, stored } = await publicReply.openAttachment(String(req.params.token), fileId, callerOf(req));
    res.setHeader("Content-Type", stored.contentType);
    if (stored.sizeBytes != null) res.setHeader("Content-Length", String(stored.sizeBytes));
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const { pipeline } = await import("node:stream/promises");
    await pipeline(stored.stream, res);
  } catch (err) {
    next(err);
  }
});

// Send the answer: 8 per 10 minutes per address.
router.post("/:token", limit(writeHits, 8, 10 * 60_000), parseUpload, async (req, res, next) => {
  try {
    const parsed = formSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new ValidationError("Please fill in your answer, name and position.");
    const files = ((req.files as Express.Multer.File[] | undefined) ?? []).map((f) => ({ originalname: f.originalname, mimetype: f.mimetype, size: f.size, buffer: f.buffer }));
    const result = await publicReply.submitReply(String(req.params.token), parsed.data, files, callerOf(req));
    res.status(201).json(formatSuccess(result, "Thank you. Your reply has been sent."));
  } catch (err) {
    next(err);
  }
});

export default router;
