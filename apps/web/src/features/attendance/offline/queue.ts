// apps/web/src/features/attendance/offline/queue.ts — NEW (E1)
import { uploadsRepository } from "@/features/uploads/repositories/uploads.repository";
import { attendanceRepository } from "../repositories/attendance.repository";
import { imageExtension } from "@/features/uploads/lib/image-extension";
import { classifySyncFailure, failureMessage } from "./sync-classify";
import {
  deletePending,
  getAllPending,
  putPending,
  type PendingAttendanceEntry,
} from "./db";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function generateClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function enqueueAttendance(input: {
  employeeId: string;
  site: string;
  projectCode: string;
  clockIn: string;
  logDate: string;
  latitude: number;
  longitude: number;
  geofence: "Inside" | "Outside" | "Unverified";
  photo: Blob;
  photoType: string;
}): Promise<string> {
  const clientRequestId = generateClientRequestId();
  await putPending({ ...input, clientRequestId, createdAt: Date.now() });
  return clientRequestId;
}

export async function listPendingCount(): Promise<number> {
  return (await getAllPending()).length;
}

/** Uploads the queued photo, then submits the clock-in with the same
 * clientRequestId the entry was created with — the server's idempotent
 * upsert (attendance/service.ts) means a retried sync after a partial
 * failure (upload succeeded, clock-in call then dropped) never double-books. */
async function syncOne(entry: PendingAttendanceEntry): Promise<void> {
  const dataUrl = await blobToDataUrl(entry.photo);
  const uploadRes = await uploadsRepository.upload(
    `attendance-${entry.clientRequestId}.${imageExtension(entry.photoType)}`,
    entry.photoType || "image/jpeg",
    dataUrl,
  );

  await attendanceRepository.clockIn({
    employeeId: entry.employeeId,
    site: entry.site,
    projectCode: entry.projectCode,
    clockIn: entry.clockIn,
    latitude: entry.latitude,
    longitude: entry.longitude,
    photoUrl: uploadRes.data.url,
    logDate: entry.logDate,
    clientRequestId: entry.clientRequestId,
    validatedOffline: true,
  });

  await deletePending(entry.clientRequestId);
}

export interface SyncResult {
  synced: number;
  /** Failed for a reason worth retrying (network, server error): still queued. */
  failed: number;
  /** The server already had a record for that day: the queued entry was removed. */
  dropped: number;
  /** Refused for a reason a retry will not fix: kept, marked, with the server message. */
  needsAttention: number;
}

/** What the page shows for queued entries. */
export interface PendingSummary {
  clientRequestId: string;
  logDate: string;
  clockIn: string;
  site: string;
  needsAttention: boolean;
  syncError: string | null;
}

export async function listPendingSummaries(): Promise<PendingSummary[]> {
  return (await getAllPending())
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((e) => ({
      clientRequestId: e.clientRequestId,
      logDate: e.logDate,
      clockIn: e.clockIn,
      site: e.site,
      needsAttention: !!e.needsAttention,
      syncError: e.syncError ?? null,
    }));
}

/** Removes a queued entry without sending it (the person chose to discard it). */
export async function discardPendingAttendance(clientRequestId: string): Promise<void> {
  await deletePending(clientRequestId);
}

/** Drains the queue one entry at a time (not in parallel — a burst of
 * simultaneous uploads on a just-restored, possibly still-flaky connection
 * is more likely to fail than a sequential drain). Failures are classified
 * (sync-classify.ts): network/5xx stay queued and retry; a duplicate for the
 * day is dropped; any other refusal stays queued, marked "needs attention"
 * with the server's message, until the person discards it. */
export async function syncPendingAttendance(opts: { includeNeedsAttention?: boolean } = {}): Promise<SyncResult> {
  const pending = await getAllPending();
  const result: SyncResult = { synced: 0, failed: 0, dropped: 0, needsAttention: 0 };

  for (const entry of pending) {
    // An entry the server refused is not sent again by the automatic sync (it would upload its
    // photo again for nothing); "Retry sync" tries it once more, in case the cause was fixed.
    if (entry.needsAttention && !opts.includeNeedsAttention) {
      result.needsAttention += 1;
      continue;
    }
    try {
      await syncOne(entry);
      result.synced += 1;
    } catch (err) {
      const kind = classifySyncFailure(err);
      if (kind === "duplicate") {
        await deletePending(entry.clientRequestId);
        result.dropped += 1;
      } else if (kind === "needs-attention") {
        await putPending({ ...entry, needsAttention: true, syncError: failureMessage(err) });
        result.needsAttention += 1;
      } else {
        await putPending({ ...entry, needsAttention: false, syncError: failureMessage(err) });
        result.failed += 1;
      }
    }
  }

  return result;
}
