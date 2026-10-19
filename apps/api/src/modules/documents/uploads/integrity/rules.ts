// apps/api/src/uploads/integrity/rules.ts: pure, no database (client demo change #2)
//
// Hashing and the verdict. A stream is hashed as it passes through (no full copy in memory), and a file
// is "damaged" only when its bytes hash differently from the fingerprint taken at upload.
import { createHash } from "node:crypto";
import { Transform, type Readable, type TransformCallback } from "node:stream";

export type IntegrityStatus = "unverified" | "verified" | "damaged";

export const sha256Hex = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");

/** Passes bytes through untouched while hashing them. Read `digest()` and `bytes` once the stream has ended. */
export class HashingTap extends Transform {
  private readonly hash = createHash("sha256");
  private done: string | null = null;
  bytes = 0;

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    this.hash.update(chunk);
    this.bytes += chunk.length;
    callback(null, chunk);
  }

  digest(): string {
    this.done ??= this.hash.digest("hex");
    return this.done;
  }
}

/** Reads a stream to its end and returns its hash and size, without keeping the bytes. */
export const hashStream = async (stream: Readable | NodeJS.ReadableStream): Promise<{ sha256: string; bytes: number }> => {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    hash.update(buf);
    bytes += buf.length;
  }
  return { sha256: hash.digest("hex"), bytes };
};

export type Verdict = "verified" | "damaged" | "unverified";

/**
 * What a fresh hash says about a file. No fingerprint on record means we cannot tell, so it stays
 * unverified: it is never called damaged, and the first look is never trusted as the baseline.
 */
export const verdictFor = (storedSha256: string | null | undefined, computedSha256: string): Verdict => {
  if (!storedSha256) return "unverified";
  return storedSha256.toLowerCase() === computedSha256.toLowerCase() ? "verified" : "damaged";
};

/** The status to show for a file: a missing row is unverified. */
export const statusOf = (row: { integrityStatus: string } | null | undefined): IntegrityStatus => {
  if (!row) return "unverified";
  return row.integrityStatus === "verified" || row.integrityStatus === "damaged" ? row.integrityStatus : "unverified";
};
