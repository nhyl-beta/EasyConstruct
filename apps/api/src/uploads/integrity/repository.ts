// apps/api/src/uploads/integrity/repository.ts (client demo change #2)
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { storedFiles, type StoredFile } from "../../db/schema/stored-files.js";
import type { IntegrityStatus } from "./rules.js";

export const findByUrl = async (url: string): Promise<StoredFile | null> => {
  const [row] = await db.select().from(storedFiles).where(eq(storedFiles.url, url));
  return row ?? null;
};

export const findByUrls = (urls: string[]): Promise<StoredFile[]> =>
  urls.length === 0 ? Promise.resolve([]) : db.select().from(storedFiles).where(inArray(storedFiles.url, urls));

/** Records (or re-records, when the same url is stored again) the fingerprint taken at upload. */
export const upsertFingerprint = async (data: {
  url: string;
  sha256: string | null;
  sizeBytes: number | null;
  contentType?: string | null;
  uploadedByUserId?: number | null;
  status: IntegrityStatus;
}) => {
  const now = new Date();
  const values = {
    url: data.url,
    sha256: data.sha256,
    sizeBytes: data.sizeBytes,
    contentType: data.contentType ?? null,
    uploadedByUserId: data.uploadedByUserId ?? null,
    integrityStatus: data.status,
    lastCheckedAt: data.status === "unverified" ? null : now,
  };
  const [row] = await db
    .insert(storedFiles)
    .values(values)
    .onConflictDoUpdate({ target: storedFiles.url, set: { ...values, uploadedAt: now } })
    .returning();
  return row!;
};

export const setStatus = async (url: string, status: IntegrityStatus) => {
  const [row] = await db
    .update(storedFiles)
    .set({ integrityStatus: status, lastCheckedAt: new Date() })
    .where(eq(storedFiles.url, url))
    .returning();
  return row ?? null;
};
