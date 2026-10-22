import { env, isS3Configured } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import type { OpenStorageResult, StorageAdapter, StoragePutInput, StorageResult } from "./adapter.js";
import { localDiskAdapter } from "./local-disk.adapter.js";
import { isS3Url, s3Adapter, type S3FileStorage } from "./s3.adapter.js";
import { isStoredBlobUrl, vercelBlobAdapter } from "./vercel-blob.adapter.js";

export interface RoutedStorage extends StorageAdapter {
  /** Streams a finished file on disk to the active backend. Only S3 supports it; callers check isS3Configured(). */
  putFile(absolutePath: string, filename: string, contentType: string): Promise<StorageResult>;
}

export interface StorageRouterDeps {
  s3: S3FileStorage;
  blob: StorageAdapter;
  local: StorageAdapter;
  s3Configured: () => boolean;
  blobConfigured: () => boolean;
}

const fileNotAvailable = () => new AppError(404, "FILE_NOT_AVAILABLE", "This file is not available on this server");

/**
 * put/putFile go to S3 if configured, else Vercel Blob if a token is set, else local disk.
 * open/delete/exists follow the URL, so older Blob and /uploads/ files stay readable for rollback.
 */
export function createStorageRouter(deps: StorageRouterDeps): RoutedStorage {
  const forUrl = (url: string): StorageAdapter | "blob" =>
    isS3Url(url) ? deps.s3 : isStoredBlobUrl(url) ? "blob" : deps.local;

  return {
    put(input: StoragePutInput): Promise<StorageResult> {
      if (deps.s3Configured()) return deps.s3.put(input);
      return (deps.blobConfigured() ? deps.blob : deps.local).put(input);
    },
    putFile(absolutePath: string, filename: string, contentType: string): Promise<StorageResult> {
      if (!deps.s3Configured()) {
        return Promise.reject(new AppError(501, "STORAGE_UNAVAILABLE", "Streaming to object storage is not configured"));
      }
      return deps.s3.putFile(absolutePath, filename, contentType);
    },
    open(url: string): Promise<OpenStorageResult> {
      const target = forUrl(url);
      if (target === "blob") return deps.blobConfigured() ? deps.blob.open(url) : Promise.reject(fileNotAvailable());
      return target.open(url);
    },
    async delete(url: string): Promise<void> {
      const target = forUrl(url);
      if (target === "blob") return deps.blobConfigured() ? deps.blob.delete(url) : undefined;
      return target.delete(url);
    },
    exists(url: string): boolean {
      const target = forUrl(url);
      if (target === "blob") return true;
      return target.exists(url);
    },
  };
}

export const storage: RoutedStorage = createStorageRouter({
  s3: s3Adapter,
  blob: vercelBlobAdapter,
  local: localDiskAdapter,
  s3Configured: isS3Configured,
  blobConfigured: () => Boolean(env.BLOB_READ_WRITE_TOKEN),
});

export { isS3Url } from "./s3.adapter.js";
export type { OpenStorageResult, StorageAdapter, StoragePutInput, StorageResult } from "./adapter.js";
