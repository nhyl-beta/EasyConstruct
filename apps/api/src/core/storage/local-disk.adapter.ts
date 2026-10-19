import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import type { OpenStorageResult, StorageAdapter, StoragePutInput, StorageResult } from "./adapter.js";

const uploadsRoot = process.env.VERCEL
  ? path.join(os.tmpdir(), "uploads")
  : path.resolve(process.cwd(), "uploads");
const uploadDirectory = path.join(uploadsRoot, "generic");

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

function resolveUploadPath(url: string): string | undefined {
  if (!url.startsWith("/uploads/")) return undefined;
  const relative = decodeURIComponent(url.slice("/uploads/".length).split(/[?#]/)[0] ?? "");
  const absolute = path.resolve(uploadsRoot, relative);
  return absolute.startsWith(uploadsRoot + path.sep) ? absolute : undefined;
}

export const localDiskAdapter: StorageAdapter = {
  async put(input: StoragePutInput): Promise<StorageResult> {
    fs.mkdirSync(uploadDirectory, { recursive: true });
    const safeName = input.filename.replace(/[^a-zA-Z0-9.\-_]/g, "-");
    const storedName = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}-${safeName}`;
    fs.writeFileSync(path.join(uploadDirectory, storedName), input.buffer);
    return {
      url: `/uploads/generic/${storedName}`,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.buffer.byteLength,
    };
  },

  async open(url: string): Promise<OpenStorageResult> {
    const absolute = resolveUploadPath(url);
    if (!absolute) throw new ValidationError("Unsupported file location");
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new NotFoundError("File");
    }
    return {
      stream: fs.createReadStream(absolute),
      contentType: MIME_BY_EXT[path.extname(absolute).toLowerCase()] ?? "application/octet-stream",
      sizeBytes: fs.statSync(absolute).size,
    };
  },

  async delete(url: string): Promise<void> {
    const absolute = resolveUploadPath(url);
    if (absolute) fs.rmSync(absolute, { force: true });
  },

  exists(url: string): boolean {
    const absolute = resolveUploadPath(url);
    return absolute ? fs.existsSync(absolute) : true;
  },
};
