// server/src/uploads/integrity/record.ts (client demo change #2)
//
// Takes the fingerprint of a file as it is stored. Never throws: a file that cannot be hashed is stored
// all the same and simply stays "unverified", because failing an upload over bookkeeping would be worse.
import { createReadStream } from "node:fs";
import * as repo from "./repository.js";
import { hashStream, sha256Hex } from "./rules.js";

interface Meta {
  url: string;
  contentType?: string | null;
  uploadedByUserId?: number | null;
}

const safely = async (label: string, run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (err) {
    console.error(`[integrity] could not record fingerprint (${label})`, err instanceof Error ? err.message : err);
  }
};

/** Base64 / in-memory uploads: the bytes are already in hand. */
export const recordBuffer = (meta: Meta & { buffer: Buffer }) =>
  safely(meta.url, () =>
    repo.upsertFingerprint({ ...meta, sha256: sha256Hex(meta.buffer), sizeBytes: meta.buffer.byteLength, status: "verified" }),
  );

/** Streamed (multer) uploads: read the finished file from disk in chunks, nothing is held in memory. */
export const recordFromDisk = (meta: Meta & { absolutePath: string }) =>
  safely(meta.url, async () => {
    const { sha256, bytes } = await hashStream(createReadStream(meta.absolutePath));
    await repo.upsertFingerprint({ ...meta, sha256, sizeBytes: bytes, status: "verified" });
  });
