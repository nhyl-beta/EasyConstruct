// apps/api/src/uploads/integrity/service.ts (client demo change #2)
import { Readable } from "node:stream";
import { logAudit } from "../../core/audit/audit.js";
import { create as createNotification } from "../../notifications/service.js";
import { NotFoundError } from "../../core/utils/errors.js";
import { openStoredFile } from "../service.js";
import { fileNameOf } from "../download-audit.js";
import * as repo from "./repository.js";
import { hashStream, statusOf, verdictFor, type IntegrityStatus } from "./rules.js";
import type { StoredFile } from "../../core/db/schema/stored-files.js";

export { recordBuffer, recordFromDisk } from "./record.js";

export const MAX_URLS_PER_LOOKUP = 200;

/** Status for each url; a url with no row is "unverified". */
export const statusMany = async (urls: string[]): Promise<Record<string, IntegrityStatus>> => {
  const unique = [...new Set(urls)].slice(0, MAX_URLS_PER_LOOKUP);
  const rows = await repo.findByUrls(unique);
  const byUrl = new Map(rows.map((r) => [r.url, r]));
  return Object.fromEntries(unique.map((u) => [u, statusOf(byUrl.get(u))]));
};

/**
 * Blob client-direct upload finished (the "upload-completed" callback): read the stored blob back once,
 * hash it, and record it. If the blob cannot be read the file stays unverified.
 */
export const recordFromBlob = async (url: string, meta: { contentType?: string | null; uploadedByUserId?: number | null } = {}) => {
  try {
    const file = await openStoredFile(url);
    const { sha256, bytes } = await hashStream(file.stream);
    await repo.upsertFingerprint({ url, sha256, sizeBytes: bytes, contentType: meta.contentType ?? file.contentType, uploadedByUserId: meta.uploadedByUserId, status: "verified" });
  } catch (err) {
    console.error("[integrity] could not hash uploaded blob", url, err instanceof Error ? err.message : err);
  }
};

/** A file failed its check: remember it, leave an audit trail line and tell Admin and IT Designer in-app. */
const flagDamaged = async (row: StoredFile, how: "download" | "check", actor: string) => {
  await repo.setStatus(row.url, "damaged");
  const name = fileNameOf(row.url);
  await logAudit({
    entityType: "file",
    entityId: `f-${row.id}`,
    action: "integrity_failed",
    actor,
    summary: `File "${name}" failed its integrity check on ${how}: the bytes no longer match the fingerprint taken at upload [${row.url}]`,
  });
  const body = `"${name}" no longer matches the fingerprint taken when it was uploaded. It may have been changed or corrupted. Re-upload it from the original.`;
  await Promise.all(
    ["admin", "it-designer"].map((recipientRole) =>
      createNotification({ recipientRole, title: "Damaged file detected", body, link: "/admin/activity-logs" }).catch((err) =>
        console.error("[integrity] could not notify", recipientRole, err),
      ),
    ),
  );
};

/** After a download finished streaming: compare what was sent with the fingerprint. */
export const afterDownload = async (url: string, sent: { sha256: string; bytes: number }, actor: string): Promise<IntegrityStatus> => {
  const row = await repo.findByUrl(url);
  if (!row?.sha256) return "unverified";
  const verdict = verdictFor(row.sha256, sent.sha256);
  if (verdict === "damaged") {
    if (row.integrityStatus !== "damaged") await flagDamaged(row, "download", actor);
    return "damaged";
  }
  if (row.integrityStatus !== "verified") await repo.setStatus(url, "verified");
  return "verified";
};

export interface CheckResult {
  url: string;
  status: IntegrityStatus;
  checkedAt: string;
  bytes: number;
  /** False when there is no fingerprint to compare with, so the result can only be "unverified". */
  hadFingerprint: boolean;
}

/** "Check file": hash the stored bytes without sending them to the user. */
export const verifyStored = async (url: string, actor: string): Promise<CheckResult> => {
  let file;
  try {
    file = await openStoredFile(url);
  } catch (err) {
    if (err instanceof NotFoundError) {
      // The bytes are gone: that is the strongest kind of damage, if we ever had a fingerprint.
      const row = await repo.findByUrl(url);
      if (row?.sha256) {
        if (row.integrityStatus !== "damaged") await flagDamaged(row, "check", actor);
        return { url, status: "damaged", checkedAt: new Date().toISOString(), bytes: 0, hadFingerprint: true };
      }
    }
    throw err;
  }
  const { sha256, bytes } = await hashStream(file.stream as Readable);
  const row = await repo.findByUrl(url);
  const verdict = verdictFor(row?.sha256, sha256);
  if (row) {
    if (verdict === "damaged" && row.integrityStatus !== "damaged") await flagDamaged(row, "check", actor);
    else if (verdict === "damaged") await repo.setStatus(url, "damaged");
    else if (verdict === "verified") await repo.setStatus(url, "verified");
  }
  return { url, status: verdict, checkedAt: new Date().toISOString(), bytes, hadFingerprint: !!row?.sha256 };
};
