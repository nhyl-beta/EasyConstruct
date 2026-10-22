// Shared resolution for stored file URLs (documents, design files, attendance
// photos, advisory docs).
//
// Stored files live in one of three places:
//   - an S3-compatible bucket ("s3:<key>"), or
//   - a PRIVATE Vercel Blob store (absolute blob URL; older files), or
//   - local disk ("/uploads/..." path) in development.
// None is fetchable by a bare link any more: a new tab carries no
// Authorization header, which is exactly how "Download" used to land on the
// login page. Both are read through GET /api/uploads/file, which checks the
// caller's token and streams the bytes. Because that needs a header, the
// client fetches the file with the token and hands the browser an object URL.
import { useEffect, useState } from "react";
import { apiClient } from "@/services/api.client";
import { getIntegrity, refreshIntegrity } from "@/features/uploads/lib/integrity-store";

const isBlobHost = (url: string) => {
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
};

/**
 * True when `url` points at a file that can actually be fetched — as opposed
 * to the `local-upload-...` placeholder stored when no file-storage provider
 * is configured (see upload-document-dialog.tsx).
 */
export function isRealFileUrl(url: string | null | undefined): boolean {
  return !!url && (/^https?:\/\//.test(url) || url.startsWith("/") || url.startsWith("s3:"));
}

/** Files that must go through the authenticated download route. */
function needsAuthFetch(url: string): boolean {
  return url.startsWith("/") || url.startsWith("s3:") || isBlobHost(url);
}

/** Fetch a stored file's bytes with the caller's credentials. */
export async function fetchFileBlob(url: string): Promise<Blob> {
  if (needsAuthFetch(url)) {
    return apiClient.getBlob(`/uploads/file?url=${encodeURIComponent(url)}`);
  }
  // Legacy public URL on another host — no credentials needed or wanted.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load file (${res.status})`);
  return res.blob();
}

export const DAMAGED_WARNING = [
  "This file failed its integrity check: it no longer matches the version that was uploaded, so it may have been changed or corrupted.",
  "Open it anyway?",
].join("\n\n");

/**
 * Before a stored file is opened or downloaded: a file already known to be damaged asks first. The status
 * is read fresh from the server, so a file that was damaged after the badge loaded is still caught.
 * Resolves false when the person chooses not to go on.
 */
export async function confirmIfDamaged(url: string): Promise<boolean> {
  if (!needsAuthFetch(url)) return true;
  const status = (await refreshIntegrity(url)) ?? getIntegrity(url);
  return status !== "damaged" || window.confirm(DAMAGED_WARNING);
}

/** Open a stored file in a new tab. */
export async function openFileUrl(url: string | null | undefined): Promise<void> {
  if (!isRealFileUrl(url)) return;
  if (!(await confirmIfDamaged(url as string))) return;
  // Fetch first, then open the finished object URL. (Opening an empty tab up
  // front and navigating it later left some browsers on about:blank.) If the
  // browser blocks the popup, save the file instead of doing nothing.
  const blob = await fetchFileBlob(url as string);
  // The server compares the bytes it just sent with the original and may have flagged the file.
  void refreshIntegrity(url as string);
  const objectUrl = URL.createObjectURL(blob);
  const tab = window.open(objectUrl, "_blank");
  if (!tab) {
    URL.revokeObjectURL(objectUrl);
    await downloadFileUrl(url);
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** Download a stored file under `filename`. */
export async function downloadFileUrl(
  url: string | null | undefined,
  filename?: string,
): Promise<void> {
  if (!isRealFileUrl(url)) return;
  if (!(await confirmIfDamaged(url as string))) return;
  const blob = await fetchFileBlob(url as string);
  void refreshIntegrity(url as string);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename ?? decodeURIComponent((url as string).split(/[?#]/)[0]!.split("/").pop() ?? "file");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

/**
 * Object URL for displaying a stored file inline (<img>, <iframe>). `error`
 * is set when the file is missing or the caller may not read it.
 */
export function useFileObjectUrl(url: string | null | undefined, enabled = true) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !isRealFileUrl(url)) {
      setObjectUrl(null);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    let created: string | null = null;
    setLoading(true);
    setError(null);
    fetchFileBlob(url as string)
      .then((blob) => {
        if (!active) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch((err: Error) => {
        if (active) {
          setObjectUrl(null);
          setError(err);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url, enabled]);

  return { objectUrl, error, loading };
}

/** Saves a Blob the app already holds (e.g. a generated template) as a download. */
export function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}
