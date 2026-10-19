// Checks that an uploaded file's CONTENT matches the type it claims (pure, no I/O).
//
// Uploads used to trust the type the browser declared and the file extension, so HTML bytes
// labelled image/png were stored. This reads the first bytes (magic numbers) and refuses a
// mismatch. It is not a virus scan: it only answers "is this really the kind of file it says".
import path from "node:path";
import fs from "node:fs";
import { AppError } from "../../../core/utils/errors.js";

export type DetectedKind =
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "tiff"
  | "heic"
  | "pdf"
  | "zip" // docx, xlsx, pptx
  | "ole2" // doc, xls, ppt, rvt
  | "dwg"
  | "skp"
  | "text" // plain text: txt, csv, dxf, ifc
  | "html" // text that is really markup or script
  | "unknown";

/** Bytes needed to decide. */
export const SNIFF_BYTES = 8192;

const startsWith = (b: Buffer, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString("latin1");

function looksLikeText(b: Buffer): boolean {
  if (b.length === 0) return true;
  let odd = 0;
  for (let i = 0; i < b.length; i += 1) {
    const c = b[i]!;
    if (c === 0) return false; // NUL: binary
    if (c < 9 || (c > 13 && c < 32)) odd += 1;
  }
  return odd / b.length < 0.02;
}

export function detectKind(head: Buffer): DetectedKind {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (ascii(head, 0, 6) === "GIF87a" || ascii(head, 0, 6) === "GIF89a") return "gif";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "webp";
  if (startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) return "tiff";
  if (ascii(head, 4, 8) === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1)/.test(ascii(head, 8, 12))) return "heic";
  if (ascii(head, 0, 5) === "%PDF-") return "pdf";
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) return "zip";
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole2";
  if (/^AC\d/.test(ascii(head, 0, 3))) return "dwg"; // AC1015, AC1018, AC1027, ...
  if (startsWith(head, [0xff, 0xfe, 0xff, 0x0e])) return "skp"; // SketchUp

  if (looksLikeText(head)) {
    const text = head.toString("utf8").replace(/^﻿/, "").trimStart().slice(0, 512).toLowerCase();
    if (/^(<!doctype html|<html|<head|<body|<script|<svg|<\?xml|<iframe|<meta|<\?php)/.test(text) || /<script[\s>]/.test(text)) return "html";
    return "text";
  }
  return "unknown";
}

/**
 * Any real image format. A photo is often named .jpg by the app or the phone while the bytes are
 * PNG, WebP or HEIC; that is still an image and is accepted. What the check refuses is an image
 * extension on something that is not an image at all (HTML, a PDF, an executable).
 */
const IMAGE_KINDS: DetectedKind[] = ["png", "jpeg", "gif", "webp", "tiff", "heic"];

/** Which detected kinds are acceptable for an extension. An extension that is not listed is not checked here. */
const EXPECTED: Record<string, DetectedKind[]> = {
  ".png": IMAGE_KINDS,
  ".jpg": IMAGE_KINDS,
  ".jpeg": IMAGE_KINDS,
  ".gif": IMAGE_KINDS,
  ".webp": IMAGE_KINDS,
  ".tif": IMAGE_KINDS,
  ".tiff": IMAGE_KINDS,
  ".pdf": ["pdf"],
  ".docx": ["zip"],
  ".xlsx": ["zip"],
  ".pptx": ["zip"],
  ".doc": ["ole2"],
  ".xls": ["ole2"],
  ".ppt": ["ole2"],
  ".rvt": ["ole2"],
  ".dwg": ["dwg"],
  // CAD/BIM formats have several encodings (binary DXF, zipped IFC, SketchUp versions): the
  // check still refuses HTML and script, which is the point.
  ".skp": ["skp", "unknown"],
  ".dxf": ["text", "unknown"],
  ".ifc": ["text", "zip"],
  ".txt": ["text"],
  ".csv": ["text"],
};

/** The detected kinds a declared MIME type allows; null = the MIME type says nothing specific. */
function kindsForMime(mime: string): DetectedKind[] | null {
  const m = mime.toLowerCase().split(";")[0]!.trim();
  if (m.startsWith("image/")) return IMAGE_KINDS;
  if (m === "application/pdf") return ["pdf"];
  if (m.startsWith("application/vnd.openxmlformats-officedocument")) return ["zip"];
  if (m === "application/msword" || m === "application/vnd.ms-excel" || m === "application/vnd.ms-powerpoint") return ["ole2"];
  if (m === "text/plain" || m === "text/csv") return ["text"];
  return null; // octet-stream, empty, CAD types the browser reports inconsistently
}

export interface SniffResult {
  ok: boolean;
  reason?: string;
}

export function checkContent(filename: string, declaredMime: string, head: Buffer): SniffResult {
  const ext = path.extname(filename).toLowerCase();
  const detected = detectKind(head);

  if (detected === "html" && ext !== ".html") {
    return { ok: false, reason: `${filename} looks like HTML or script, not a ${ext || "supported"} file` };
  }
  const byExt = EXPECTED[ext];
  if (byExt && !byExt.includes(detected)) {
    return { ok: false, reason: `${filename} does not contain a ${ext.slice(1).toUpperCase()} file (it looks like ${detected})` };
  }
  const byMime = kindsForMime(declaredMime);
  if (byMime && !byMime.includes(detected)) {
    return { ok: false, reason: `${filename} is labelled ${declaredMime} but its content is ${detected}` };
  }
  return { ok: true };
}

/** Throws the 400 UNSUPPORTED_FILE_TYPE the upload routes already use for a refused type. */
export function assertContentMatches(filename: string, declaredMime: string, head: Buffer): void {
  const r = checkContent(filename, declaredMime, head.subarray(0, SNIFF_BYTES));
  if (!r.ok) throw new AppError(400, "UNSUPPORTED_FILE_TYPE", `Unsupported file type: ${r.reason}`);
}

/** Same check for a file already written to disk by multer; the file is deleted when it fails. */
export async function assertDiskFileMatches(filePath: string, filename: string, declaredMime: string): Promise<void> {
  const fh = await fs.promises.open(filePath, "r");
  let head: Buffer;
  try {
    const buf = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await fh.read(buf, 0, SNIFF_BYTES, 0);
    head = buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
  try {
    assertContentMatches(filename, declaredMime, head);
  } catch (err) {
    await fs.promises.rm(filePath, { force: true }).catch(() => undefined);
    throw err;
  }
}
