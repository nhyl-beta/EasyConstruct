import { del, get, put } from "@vercel/blob";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "../config/env.js";
import { AppError, NotFoundError, ValidationError } from "../utils/errors.js";
import type { OpenStorageResult, StorageAdapter, StoragePutInput, StorageResult } from "./adapter.js";
import { localDiskAdapter } from "./local-disk.adapter.js";

const isBlobUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
};

export const vercelBlobAdapter: StorageAdapter = {
  async put(input: StoragePutInput): Promise<StorageResult> {
    try {
      const blob = await put(
        `easyconstruct/${Date.now()}-${input.filename.replace(/[^a-zA-Z0-9.\-_]/g, "-")}`,
        input.buffer,
        { access: "private", contentType: input.contentType, token: env.BLOB_READ_WRITE_TOKEN },
      );
      return {
        url: blob.url,
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.buffer.byteLength,
      };
    } catch (error) {
      if (process.env.VERCEL || env.NODE_ENV === "production") {
        console.error("[uploads] Vercel Blob upload failed.", error);
        throw new AppError(
          502,
          "STORAGE_UNAVAILABLE",
          "File storage is unavailable right now. Please try again.",
        );
      }
      console.error(
        "[uploads] Vercel Blob rejected the upload; falling back to local disk.",
        error instanceof Error ? error.message : error,
      );
      return localDiskAdapter.put(input);
    }
  },

  async open(url: string): Promise<OpenStorageResult> {
    if (!isBlobUrl(url)) return localDiskAdapter.open(url);
    if (!env.BLOB_READ_WRITE_TOKEN) throw new NotFoundError("File");
    let result = await get(url, { access: "private", token: env.BLOB_READ_WRITE_TOKEN }).catch(() => null);
    if (!result || result.statusCode !== 200) {
      result = await get(url, { access: "public", token: env.BLOB_READ_WRITE_TOKEN }).catch(() => null);
    }
    if (!result || result.statusCode !== 200) throw new NotFoundError("File");
    return {
      stream: Readable.fromWeb(result.stream as never),
      contentType: result.blob.contentType,
      sizeBytes: result.blob.size,
    };
  },

  async delete(url: string): Promise<void> {
    if (isBlobUrl(url)) {
      if (env.BLOB_READ_WRITE_TOKEN) await del(url, { token: env.BLOB_READ_WRITE_TOKEN });
      return;
    }
    await localDiskAdapter.delete(url);
  },

  exists(url: string): boolean {
    if (isBlobUrl(url) || !url.startsWith("/uploads/")) return true;
    const root = process.env.VERCEL
      ? path.join(os.tmpdir(), "uploads")
      : path.resolve(process.cwd(), "uploads");
    const relative = decodeURIComponent(url.slice("/uploads/".length).split(/[?#]/)[0] ?? "");
    const absolute = path.resolve(root, relative);
    return absolute.startsWith(root + path.sep) && fs.existsSync(absolute);
  },
};

export function isStoredBlobUrl(url: string): boolean {
  return isBlobUrl(url);
}
