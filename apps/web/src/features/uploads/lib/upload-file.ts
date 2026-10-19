// Shared large-file upload for floor plans and other big files.
//
// The server decides the route (GET /uploads/config):
//  - "blob": the browser uploads straight to the private Vercel Blob store with
//    a short-lived token from POST /uploads/client-token. Serverless functions
//    cap request bodies at ~4.5 MB, so large files cannot pass through the API.
//  - "disk": multipart POST /uploads/stream, streamed to the server's disk
//    (local development).
// Both report progress and return the same { url, filename, contentType,
// sizeBytes } the base64 upload returns, so callers store it unchanged.
import { upload as blobUpload } from "@vercel/blob/client";

import { apiClient, apiUrl } from "@/services/api.client";
import { getToken } from "@/auth/session";

export interface UploadedFile {
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

interface UploadConfig {
  maxBytes: number;
  mode: "blob" | "disk";
}

const ALLOWED_EXTENSIONS = [
  ".dwg", ".dxf", ".rvt", ".ifc", ".skp",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".tif", ".tiff",
];

export const formatBytes = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

let configPromise: Promise<UploadConfig> | null = null;
const loadConfig = (): Promise<UploadConfig> => {
  configPromise ??= apiClient
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .get("/uploads/config").then((json: any) => (json?.data ?? json) as UploadConfig)
    .catch((err) => {
      configPromise = null;
      throw err;
    });
  return configPromise;
};

/** Largest accepted file, in bytes (from the server's MAX_UPLOAD_MB). */
export const getMaxUploadBytes = async (): Promise<number> => (await loadConfig()).maxBytes;

/** Returns a plain-language reason the file can't be uploaded, or null if it can. */
export async function checkUploadable(file: File): Promise<string | null> {
  const { maxBytes } = await loadConfig();
  if (!ALLOWED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
    return `${file.name}: this file type isn't supported. Use PDF, DWG/DXF, Office documents or images.`;
  }
  if (file.size > maxBytes) {
    return `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}.`;
  }
  return null;
}

function streamToServer(file: File, onProgress?: (pct: number) => void): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl("/uploads/stream"));
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.onload = () => {
      let body: { data?: UploadedFile; message?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error body */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.data) resolve(body.data);
      else reject(new Error(body.message ?? `Upload failed (${xhr.status})`));
    };
    xhr.send(form);
  });
}

/** Uploads one file with progress (0–100); rejects with a readable message. */
export async function uploadLargeFile(file: File, onProgress?: (pct: number) => void): Promise<UploadedFile> {
  const problem = await checkUploadable(file);
  if (problem) throw new Error(problem);

  const { mode } = await loadConfig();
  if (mode === "disk") return streamToServer(file, onProgress);

  const token = getToken();
  const blob = await blobUpload(`easyconstruct/${file.name}`, file, {
    access: "private",
    handleUploadUrl: apiUrl("/uploads/client-token"),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
  });
  return {
    url: blob.url,
    filename: file.name,
    contentType: file.type || blob.contentType || "application/octet-stream",
    sizeBytes: file.size,
  };
}
