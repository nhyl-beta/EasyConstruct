// apps/api/src/uploads/limits.ts
//
// One place for "how big may an upload be and what kinds are allowed", shared
// by the base64 upload, the streaming (multipart) upload and the Vercel Blob
// client-upload token route.
import { env } from "../config/env.js";

const MB = 1024 * 1024;

/** Largest file accepted by the streaming / client-direct upload paths (MAX_UPLOAD_MB, default 100). */
export const maxUploadBytes = (): number => env.MAX_UPLOAD_MB * MB;

// Extensions trusted regardless of the (often wrong) browser-reported MIME
// type. Floor plans arrive as PDF, DWG/DXF or large images.
export const UPLOAD_EXTENSIONS = [
  ".dwg", ".dxf", ".rvt", ".ifc", ".skp",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".tif", ".tiff",
] as const;

export const hasAllowedExtension = (filename: string): boolean => {
  const lower = filename.toLowerCase();
  return UPLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

export const formatLimit = (bytes: number): string => `${Math.round(bytes / MB)} MB`;

/**
 * The two payloads Vercel Blob's client-upload protocol sends to our token route. Anything else
 * (an empty or junk body) is a 400 here instead of an exception from the Blob SDK.
 */
export const isBlobClientUploadBody = (body: unknown): boolean => {
  if (!body || typeof body !== "object") return false;
  const b = body as { type?: unknown; payload?: unknown };
  return (b.type === "blob.generate-client-token" || b.type === "blob.upload-completed") && !!b.payload && typeof b.payload === "object";
};
