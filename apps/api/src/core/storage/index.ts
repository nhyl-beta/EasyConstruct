import { env } from "../config/env.js";
import type { StorageAdapter } from "./adapter.js";
import { localDiskAdapter } from "./local-disk.adapter.js";
import { vercelBlobAdapter } from "./vercel-blob.adapter.js";

export const storage: StorageAdapter = env.BLOB_READ_WRITE_TOKEN
  ? vercelBlobAdapter
  : localDiskAdapter;

export type { OpenStorageResult, StorageAdapter, StoragePutInput, StorageResult } from "./adapter.js";
