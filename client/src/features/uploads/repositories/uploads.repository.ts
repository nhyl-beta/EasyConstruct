import { apiClient } from "@/services/api.client";

export interface UploadResult {
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export const uploadsRepository = {
  upload: (filename: string, contentType: string, dataUrl: string): Promise<{ data: UploadResult }> =>
    apiClient.post("/uploads", { filename, contentType, dataUrl }),
};

// Corrupted-file check (client demo change #2).
export type FileIntegrityStatus = "unverified" | "verified" | "damaged";

export interface FileCheckResult {
  url: string;
  status: FileIntegrityStatus;
  checkedAt: string;
  bytes: number;
  /** False when no fingerprint was taken at upload, so the check can only say "unverified". */
  hadFingerprint: boolean;
}

export const integrityRepository = {
  /** Status per url; a url the server has no record of comes back "unverified". */
  statuses: async (urls: string[]): Promise<Record<string, FileIntegrityStatus>> => {
    const res = await apiClient.post("/uploads/integrity", { urls });
    return (res?.data ?? {}) as Record<string, FileIntegrityStatus>;
  },
  /** "Check file": the server hashes the stored bytes and compares; nothing is downloaded. */
  check: async (url: string): Promise<FileCheckResult> => {
    const res = await apiClient.post("/uploads/verify", { url });
    return res.data as FileCheckResult;
  },
};
