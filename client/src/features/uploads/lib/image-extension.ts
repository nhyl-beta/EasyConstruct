const BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heic",
};

/** File extension for a photo's MIME type, so the stored name matches the bytes (default jpg). */
export function imageExtension(mime: string | null | undefined): string {
  return BY_MIME[(mime ?? "").toLowerCase().split(";")[0]!.trim()] ?? "jpg";
}
