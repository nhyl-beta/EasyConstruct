import { NextFunction, Response } from "express";
import { pipeline } from "node:stream/promises";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { env, isS3Configured } from "../../../core/config/env.js";
import { unlink } from "node:fs/promises";
import { storage } from "../../../core/storage/index.js";
import { AppError } from "../../../core/utils/errors.js";
import { formatLimit, hasAllowedExtension, isBlobClientUploadBody, maxUploadBytes } from "./limits.js";
import { ValidationError } from "../../../core/utils/errors.js";
import { HTTP } from "../../../core/config/http-status.js";
import { formatSuccess } from "../../../core/utils/response.js";
import * as service from "./service.js";
import { assertCanOpenFile } from "./finance-files.js";
import { assertDiskFileMatches } from "./sniff.js";
import type { AuthedRequest } from "../../../core/auth/middleware.js";
import { logAudit } from "../../../core/audit/audit.js";
import { buildDownloadAudit, type DownloadResult } from "./download-audit.js";
import { findFileContext } from "./file-context.js";
import * as integrity from "./integrity/service.js";
import { HashingTap } from "./integrity/rules.js";

export const upload = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.uploadFile(req.body, req.authUser?.id);
    res.status(HTTP.CREATED).json(formatSuccess(data, "File uploaded"));
  } catch (err) {
    next(err);
  }
};

// GET /api/uploads/config — what the browser needs to pick an upload path:
// "blob" = upload straight to Vercel Blob with a short-lived token (the only
// way past the ~4.5 MB request limit of serverless functions), "disk" =
// multipart stream to this server (local development, and any S3-backed deployment, where the server then
// forwards the file to the bucket).
export const config = (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(
      formatSuccess(
        { maxBytes: maxUploadBytes(), mode: !isS3Configured() && env.BLOB_READ_WRITE_TOKEN ? "blob" : "disk" },
        "Upload configuration",
      ),
    );
  } catch (err) {
    next(err);
  }
};

// POST /api/uploads/stream (multipart, field "file") — streamed to disk.
export const uploadStreamed = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new ValidationError("Choose a file to upload");
    // The file is already on disk; refuse (and delete) it when its bytes are not the type it claims.
    await assertDiskFileMatches(req.file.path, req.file.originalname, req.file.mimetype || "");
    if (isS3Configured()) return await uploadStreamedToS3(req, res);
    // Fingerprint the finished file (read from disk in chunks) so a later change is noticed.
    await integrity.recordFromDisk({
      url: `/uploads/generic/${req.file.filename}`,
      absolutePath: req.file.path,
      contentType: req.file.mimetype || "application/octet-stream",
      uploadedByUserId: req.authUser?.id,
    });
    res.status(HTTP.CREATED).json(
      formatSuccess(
        {
          url: `/uploads/generic/${req.file.filename}`,
          filename: req.file.originalname,
          contentType: req.file.mimetype || "application/octet-stream",
          sizeBytes: req.file.size,
        },
        "File uploaded",
      ),
    );
  } catch (err) {
    next(err);
  }
};

// S3 variant of uploadStreamed: the temp file goes to the bucket, is fingerprinted while it still exists, then
// removed. Any failure removes the temp file and answers STORAGE_UNAVAILABLE (502).
const uploadStreamedToS3 = async (req: AuthedRequest, res: Response) => {
  const file = req.file!;
  const contentType = file.mimetype || "application/octet-stream";
  try {
    const stored = await storage.putFile(file.path, file.originalname, contentType);
    await integrity.recordFromDisk({
      url: stored.url,
      absolutePath: file.path,
      contentType,
      uploadedByUserId: req.authUser?.id,
    });
    res.status(HTTP.CREATED).json(
      formatSuccess(
        { url: stored.url, filename: file.originalname, contentType, sizeBytes: file.size },
        "File uploaded",
      ),
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error("[uploads] streamed S3 upload failed", err);
    throw new AppError(502, "STORAGE_UNAVAILABLE", "File storage is unavailable right now. Please try again.");
  } finally {
    await unlink(file.path).catch(() => undefined);
  }
};

// POST /api/uploads/client-token — issues the short-lived token the browser
// uses to upload directly to the (private) Blob store. The caller is already
// authenticated by the router; size and type limits are fixed here so the
// browser cannot choose its own.
export const clientToken = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!env.BLOB_READ_WRITE_TOKEN) {
      throw new AppError(501, "BLOB_NOT_CONFIGURED", "Direct uploads are not configured on this server");
    }
    if (!isBlobClientUploadBody(req.body)) {
      throw new ValidationError("Expected a Vercel Blob client-upload request (type and payload).");
    }
    const json = await handleUpload({
      token: env.BLOB_READ_WRITE_TOKEN,
      request: req,
      body: req.body as HandleUploadBody,
      // Vercel Blob calls this route back (signed, no login) when the browser's direct upload has finished.
      // The blob is read back once and hashed. In local development the callback cannot reach this machine,
      // so such files simply stay "unverified".
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let userId: number | null = null;
        try {
          const parsed = JSON.parse(tokenPayload ?? "{}") as { userId?: number | null };
          userId = typeof parsed.userId === "number" ? parsed.userId : null;
        } catch {
          userId = null;
        }
        await integrity.recordFromBlob(blob.url, { contentType: blob.contentType, uploadedByUserId: userId });
      },
      onBeforeGenerateToken: async (pathname) => {
        if (!hasAllowedExtension(pathname)) {
          throw new ValidationError(`Unsupported file type: ${pathname}`);
        }
        return {
          maximumSizeInBytes: maxUploadBytes(),
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: req.authUser?.id ?? null, limit: formatLimit(maxUploadBytes()) }),
        };
      },
    });
    res.json(json);
  } catch (err) {
    next(err);
  }
};

// GET /api/uploads/file?url=<stored url>
// Streams any stored file to an authenticated caller. A plain link can't send
// an Authorization header, so the client fetches this with the token and turns
// the response into an object URL (see client lib/file-url.ts).
export const download = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  const url = typeof req.query.url === "string" ? req.query.url : "";
  const actor = req.authUser?.name ?? "unknown";
  // Every attempt leaves a line: who, which file, which project (when the file belongs to a document) and the
  // result. A refused or failed attempt is recorded too. Downloads of Legal-category documents are "sensitive".
  const record = async (result: DownloadResult, reason?: string) => {
    const { ctx, sensitive } = await findFileContext(url);
    await logAudit(buildDownloadAudit({ actor, url, ctx, sensitive, result, reason }));
  };
  try {
    if (!url) throw new ValidationError("url is required");
    await assertCanOpenFile(url, req.authUser);
    const file = await service.openStoredFile(url);
    await record("ok");
    res.setHeader("Content-Type", file.contentType);
    if (file.sizeBytes != null) res.setHeader("Content-Length", String(file.sizeBytes));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Hash the bytes as they go out (nothing is buffered). If they no longer match the fingerprint taken at
    // upload, the file is marked damaged and Admin / IT Designer are told (integrity/service.ts).
    const tap = new HashingTap();
    await pipeline(file.stream, tap, res);
    await integrity.afterDownload(url, { sha256: tap.digest(), bytes: tap.bytes }, actor).catch((e) => console.error("[integrity] download check failed", e));
  } catch (err) {
    if (url && !res.headersSent) {
      const status = err instanceof AppError ? err.statusCode : 500;
      await record(status === 403 ? "denied" : status === 404 ? "not_found" : "failed", err instanceof Error ? err.message : undefined);
    }
    next(err);
  }
};

// POST /api/uploads/verify { url } - "Check file": hash the stored bytes without sending them to the user.
export const verify = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const url = typeof req.body?.url === "string" ? req.body.url : "";
    if (!url) throw new ValidationError("url is required");
    await assertCanOpenFile(url, req.authUser);
    const result = await integrity.verifyStored(url, req.authUser?.name ?? "unknown");
    res.json(formatSuccess(result, result.status === "damaged" ? "This file does not match its original" : "File checked"));
  } catch (err) {
    next(err);
  }
};

// POST /api/uploads/integrity { urls } - the badge next to a file link. A url with no record is "unverified".
export const integrityStatuses = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const urls: unknown = req.body?.urls;
    if (!Array.isArray(urls) || urls.some((u) => typeof u !== "string")) throw new ValidationError("urls must be a list of strings");
    if (urls.length > integrity.MAX_URLS_PER_LOOKUP) throw new ValidationError(`At most ${integrity.MAX_URLS_PER_LOOKUP} urls at a time`);
    res.json(formatSuccess(await integrity.statusMany(urls as string[]), "File integrity retrieved"));
  } catch (err) {
    next(err);
  }
};
