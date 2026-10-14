import { del, get, put } from "@vercel/blob";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { env } from "../config/env.js";
import { AppError, NotFoundError, ValidationError } from "../utils/errors.js";

import type { UploadInput, UploadResult } from "./types.js";

// Same read-only-fs rule as server/src/documents/upload.ts: only os.tmpdir()
// is writable on Vercel.
export const uploadDirectory = process.env.VERCEL
  ? path.join(os.tmpdir(), "uploads", "generic")
  : path.resolve(process.cwd(), "uploads", "generic");

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

// Photos and PDFs cover attendance/task evidence. Design files are CAD and
// office documents (blueprints.file_type defaults to "DWG"), which the
// image/PDF-only list rejected outright — browsers also report DWG/DXF
// inconsistently, often as application/octet-stream or an empty type, so
// those are matched by extension below rather than MIME alone.
const ALLOWED_PREFIXES = [
  "image/",
  "application/pdf",
  "application/acad",
  "image/vnd.dwg",
  "application/dxf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
];

// Extensions trusted when the browser sends a generic or empty MIME type.
const ALLOWED_EXTENSIONS = [
  ".dwg",
  ".dxf",
  ".rvt",
  ".ifc",
  ".skp",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
];

export function isAllowedUpload(mime: string, filename: string): boolean {
  if (ALLOWED_PREFIXES.some((prefix) => mime.startsWith(prefix))) return true;

  const generic =
    mime === "application/octet-stream" || mime === "" || mime === "application/x-empty";

  if (!generic) return false;

  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function decodeDataUrl(
  dataUrl: string,
): { buffer: Buffer; mime: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);

  if (!match) {
    throw new ValidationError(
      "Expected a base64 data URL",
    );
  }

  const mime = match[1];
  const base64 = match[2];

  if (!mime || !base64) {
    throw new ValidationError(
      "Invalid base64 data URL",
    );
  }

  const buffer = Buffer.from(base64, "base64");

  return {
    buffer,
    mime,
  };
}

export const uploadFile = async (
  input: UploadInput,
): Promise<UploadResult> => {
  const { buffer, mime } = decodeDataUrl(
    input.dataUrl,
  );

  if (!isAllowedUpload(mime, input.filename)) {
    throw new ValidationError(
      `Unsupported file type: ${mime || "unknown"} (${input.filename})`,
    );
  }

  if (buffer.byteLength > MAX_BYTES) {
    throw new ValidationError(
      "File exceeds the 8MB upload limit",
    );
  }

  return storeBuffer({
    buffer,
    filename: input.filename,
    contentType: input.contentType || mime,
  });
};

/**
 * Stores bytes in the durable backend: Vercel Blob when configured (private
 * store), local disk on a development machine only. Callers that already
 * validated the file (a multer upload, a data-URL upload) use this so every
 * file ends up behind a URL that survives the next serverless invocation.
 */
export const storeBuffer = async (input: {
  buffer: Buffer;
  filename: string;
  contentType: string;
}): Promise<UploadResult> => {
  const { buffer, contentType } = input;

  if (env.BLOB_READ_WRITE_TOKEN) {
    try {
      // The store is configured for PRIVATE access — project documents must
      // not be world-readable by URL — so the write asks for "private" too.
      // Asking for "public" against a private store was the BlobError that
      // pushed every upload onto local disk. A private blob can't be fetched
      // by the browser directly; files are read back through the
      // authenticated GET /api/uploads/file route (see openStoredFile).
      const blob = await put(
        `easyconstruct/${Date.now()}-${input.filename.replace(/[^a-zA-Z0-9.\-_]/g, "-")}`,
        buffer,
        {
          access: "private",
          contentType,
          token: env.BLOB_READ_WRITE_TOKEN,
        },
      );

      return {
        url: blob.url,
        filename: input.filename,
        contentType,
        sizeBytes: buffer.byteLength,
      };
    } catch (error) {
      // Local disk is ephemeral on Vercel (os.tmpdir() is wiped between
      // invocations), so silently falling back there in production would
      // hand back a URL that 404s minutes later. Fail loudly instead; the
      // local fallback exists for development machines only, and is served
      // by the same authenticated download route.
      if (process.env.VERCEL || env.NODE_ENV === "production") {
        console.error("[uploads] Vercel Blob upload failed.", error);
        throw new AppError(
          502,
          "STORAGE_UNAVAILABLE",
          "File storage is unavailable right now. Please try again.",
        );
      }
      console.error(
        "[uploads] Vercel Blob rejected the upload; falling back to local disk.",
        error instanceof Error ? error.message : error,
      );
    }
  }

  // No usable Vercel Blob store (not configured, or it rejected the write) —
  // fall back to the same local-disk storage pattern used by
  // server/src/documents/upload.ts.
  fs.mkdirSync(uploadDirectory, { recursive: true });
  const safeName = input.filename.replace(/[^a-zA-Z0-9.\-_]/g, "-");
  const storedName = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}-${safeName}`;
  fs.writeFileSync(path.join(uploadDirectory, storedName), buffer);

  return {
    url: `/uploads/generic/${storedName}`,
    filename: input.filename,
    contentType,
    sizeBytes: buffer.byteLength,
  };
};

// ---------------------------------------------------------------------------
// Download — one route for every stored file, whichever backend wrote it.
//
// The stored `url` on a record is either a Vercel Blob URL (private store) or
// a path under /uploads/ (local disk, including the multer-based
// /api/documents/upload). Both are resolved here, after authentication, so no
// file is reachable by guessing a URL.

const uploadsRoot = process.env.VERCEL
  ? path.join(os.tmpdir(), "uploads")
  : path.resolve(process.cwd(), "uploads");

const isBlobUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
};

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

export interface StoredFile {
  stream: NodeJS.ReadableStream;
  contentType: string;
  sizeBytes?: number;
}

/** Best-effort removal of a stored file; a missing file is not an error. */
export const deleteStoredFile = async (storedUrl: string): Promise<void> => {
  try {
    if (isBlobUrl(storedUrl)) {
      if (env.BLOB_READ_WRITE_TOKEN) await del(storedUrl, { token: env.BLOB_READ_WRITE_TOKEN });
      return;
    }
    if (storedUrl.startsWith("/uploads/")) {
      const relative = decodeURIComponent(storedUrl.slice("/uploads/".length).split(/[?#]/)[0] ?? "");
      const absolute = path.resolve(uploadsRoot, relative);
      if (absolute.startsWith(uploadsRoot + path.sep)) fs.rmSync(absolute, { force: true });
    }
  } catch (error) {
    console.error("[uploads] could not remove stored file", storedUrl, error);
  }
};

/**
 * Whether the bytes behind a stored url can still be read. A Blob url is assumed readable.
 * A /uploads/ path is local disk, which on Vercel is wiped between invocations, so files
 * stored that way earlier may be gone (their rows survive, the bytes do not).
 */
export const isStoredFileAvailable = (storedUrl: string): boolean => {
  if (isBlobUrl(storedUrl) || !storedUrl.startsWith("/uploads/")) return true;
  const relative = decodeURIComponent(storedUrl.slice("/uploads/".length).split(/[?#]/)[0] ?? "");
  const absolute = path.resolve(uploadsRoot, relative);
  return absolute.startsWith(uploadsRoot + path.sep) && fs.existsSync(absolute);
};

export const openStoredFile = async (storedUrl: string): Promise<StoredFile> => {
  if (isBlobUrl(storedUrl)) {
    if (!env.BLOB_READ_WRITE_TOKEN) throw new NotFoundError("File");
    // Files stored before the store was made private (or by a public store)
    // are public blobs; read whichever kind this one is.
    let result = await get(storedUrl, { access: "private", token: env.BLOB_READ_WRITE_TOKEN }).catch(() => null);
    if (!result || result.statusCode !== 200) {
      result = await get(storedUrl, { access: "public", token: env.BLOB_READ_WRITE_TOKEN }).catch(() => null);
    }
    if (!result || result.statusCode !== 200) throw new NotFoundError("File");
    return {
      stream: Readable.fromWeb(result.stream as never),
      contentType: result.blob.contentType,
      sizeBytes: result.blob.size,
    };
  }

  if (storedUrl.startsWith("/uploads/")) {
    const relative = decodeURIComponent(storedUrl.slice("/uploads/".length).split(/[?#]/)[0] ?? "");
    const absolute = path.resolve(uploadsRoot, relative);
    // Reject ../ traversal out of the uploads directory.
    if (!absolute.startsWith(uploadsRoot + path.sep)) throw new NotFoundError("File");
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new NotFoundError("File");
    }
    return {
      stream: fs.createReadStream(absolute),
      contentType:
        MIME_BY_EXT[path.extname(absolute).toLowerCase()] ?? "application/octet-stream",
      sizeBytes: fs.statSync(absolute).size,
    };
  }

  throw new ValidationError("Unsupported file location");
};
