// One place that knows which content type a stored file should be served with.
//
// B-207: a file stored in S3 or Vercel Blob keeps whatever content type the browser claimed at upload.
// Some browsers claim nothing (or application/octet-stream) for a PDF; the bytes are fine, but the
// download route then served them as a generic binary, so the viewer got a blob it could not render
// and a new tab said the file was corrupted. The extension is a reliable fallback.
export const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

const GENERIC = new Set(["", "application/octet-stream", "binary/octet-stream"]);

/** The extension of a stored name or URL, lower case, ignoring any query string. */
export const extensionOf = (nameOrUrl: string): string => {
  const base = (nameOrUrl.split(/[?#]/)[0] ?? "").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
};

/** The claimed type if it says something, otherwise the one the extension implies. */
export const resolveContentType = (claimed: string | null | undefined, nameOrUrl: string): string => {
  const c = (claimed ?? "").split(";")[0]!.trim().toLowerCase();
  if (!GENERIC.has(c)) return claimed as string;
  return MIME_BY_EXT[extensionOf(nameOrUrl)] ?? (c || "application/octet-stream");
};
