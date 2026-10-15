import { NextFunction, Response } from "express";
import { pipeline } from "node:stream/promises";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { formatLimit, hasAllowedExtension, isBlobClientUploadBody, maxUploadBytes } from "./limits.js";
import { ValidationError } from "../utils/errors.js";
import { HTTP } from "../constants/http-status.js";
import { formatSuccess } from "../utils/response.js";
import * as service from "./service.js";
import { assertCanOpenFile } from "./finance-files.js";
import { assertDiskFileMatches } from "./sniff.js";
import type { AuthedRequest } from "../middleware/auth.js";

export const upload = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.uploadFile(req.body);
    res.status(HTTP.CREATED).json(formatSuccess(data, "File uploaded"));
  } catch (err) {
    next(err);
  }
};

// GET /api/uploads/config — what the browser needs to pick an upload path:
// "blob" = upload straight to Vercel Blob with a short-lived token (the only
// way past the ~4.5 MB request limit of serverless functions), "disk" =
// multipart stream to this server (local development).
export const config = (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(
      formatSuccess(
        { maxBytes: maxUploadBytes(), mode: env.BLOB_READ_WRITE_TOKEN ? "blob" : "disk" },
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
  try {
    const url = typeof req.query.url === "string" ? req.query.url : "";
    if (!url) throw new ValidationError("url is required");
    await assertCanOpenFile(url, req.authUser);
    const file = await service.openStoredFile(url);
    res.setHeader("Content-Type", file.contentType);
    if (file.sizeBytes != null) res.setHeader("Content-Length", String(file.sizeBytes));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    await pipeline(file.stream, res);
  } catch (err) {
    next(err);
  }
};
