import os from "node:os";
import path from "node:path";
import { storage } from "../../../core/storage/index.js";
import { ValidationError } from "../../../core/utils/errors.js";
import { assertContentMatches } from "./sniff.js";
import { recordBuffer } from "./integrity/record.js";
import type { UploadInput, UploadResult } from "./types.js";

export const uploadDirectory = process.env.VERCEL
  ? path.join(os.tmpdir(), "uploads", "generic")
  : path.resolve(process.cwd(), "uploads", "generic");

const MAX_BYTES = 8 * 1024 * 1024;
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
const ALLOWED_EXTENSIONS = [
  ".dwg", ".dxf", ".rvt", ".ifc", ".skp", ".pdf", ".doc", ".docx", ".xls", ".xlsx",
];

export function isAllowedUpload(mime: string, filename: string): boolean {
  if (ALLOWED_PREFIXES.some((prefix) => mime.startsWith(prefix))) return true;
  const generic =
    mime === "application/octet-stream" || mime === "" || mime === "application/x-empty";
  return generic && ALLOWED_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext));
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new ValidationError("Expected a base64 data URL");
  const mime = match[1];
  const base64 = match[2];
  if (!mime || !base64) throw new ValidationError("Invalid base64 data URL");
  return { buffer: Buffer.from(base64, "base64"), mime };
}

export const uploadFile = async (
  input: UploadInput,
  uploadedByUserId?: number,
): Promise<UploadResult> => {
  const { buffer, mime } = decodeDataUrl(input.dataUrl);
  if (!isAllowedUpload(mime, input.filename)) {
    throw new ValidationError(
      `Unsupported file type: ${mime || "unknown"} (${input.filename})`,
    );
  }
  if (buffer.byteLength > MAX_BYTES) {
    throw new ValidationError("File exceeds the 8MB upload limit");
  }
  assertContentMatches(input.filename, mime, buffer);
  return storeBuffer({
    buffer,
    filename: input.filename,
    contentType: input.contentType || mime,
    uploadedByUserId,
  });
};

export const storeBuffer = async (input: {
  buffer: Buffer;
  filename: string;
  contentType: string;
  uploadedByUserId?: number;
}): Promise<UploadResult> => {
  const stored = await storage.put(input);
  await recordBuffer({
    url: stored.url,
    buffer: input.buffer,
    contentType: stored.contentType,
    uploadedByUserId: input.uploadedByUserId,
  });
  return stored;
};

export interface StoredFile {
  stream: NodeJS.ReadableStream;
  contentType: string;
  sizeBytes?: number;
}

export const deleteStoredFile = async (storedUrl: string): Promise<void> => {
  try {
    await storage.delete(storedUrl);
  } catch (error) {
    console.error("[uploads] could not remove stored file", storedUrl, error);
  }
};

export const isStoredFileAvailable = (storedUrl: string): boolean =>
  storage.exists(storedUrl);

// The storage router sends s3:, Blob and /uploads/ urls to their own adapters (and refuses a Blob url when
// no Blob token is set).
export const openStoredFile = async (storedUrl: string): Promise<StoredFile> => {
  return storage.open(storedUrl);
};
