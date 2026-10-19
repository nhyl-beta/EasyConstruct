// apps/api/src/uploads/stream.ts
//
// Multipart upload that streams straight to disk (no base64, nothing buffered
// in memory), for large files such as floor plans. Used when no Vercel Blob
// store is configured (local development); in production the browser uploads
// to Blob directly (see controller.clientToken).
import fs from "node:fs";
import path from "node:path";
import multer from "multer";

import { uploadDirectory } from "./service.js";
import { hasAllowedExtension, maxUploadBytes } from "./limits.js";
import { ValidationError } from "../core/utils/errors.js";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(uploadDirectory, { recursive: true });
    cb(null, uploadDirectory);
  },
  filename: (_req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9.\-_]/g, "-");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1_000_000)}-${safe}`);
  },
});

// Built per request so MAX_UPLOAD_MB is read when the request arrives.
export const streamUpload = () =>
  multer({
    storage,
    limits: { fileSize: maxUploadBytes(), files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!hasAllowedExtension(file.originalname)) {
        return cb(new ValidationError(`Unsupported file type: ${file.originalname}`));
      }
      cb(null, true);
    },
  }).single("file");
