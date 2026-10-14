// client/src/features/attendance/offline/db.ts — NEW (E1)
//
// A small hand-rolled IndexedDB wrapper — no `idb` package, per the "no new
// runtime deps" rule. Just enough of the API this queue needs: open, put,
// getAll, delete. Photos are stored as Blobs (IndexedDB supports storing
// Blobs directly), never as base64 in localStorage — localStorage has a
// ~5MB string quota that a handful of photos would blow through immediately.
const DB_NAME = "easyconstruct-offline";
const DB_VERSION = 1;
export const STORE_NAME = "pending-attendance";

export interface PendingAttendanceEntry {
  clientRequestId: string;
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
  createdAt: number;
  syncError?: string;
  /** The server refused this entry for a reason a retry will not fix (not a duplicate). */
  needsAttention?: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "clientRequestId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putPending(entry: PendingAttendanceEntry): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllPending(): Promise<PendingAttendanceEntry[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as PendingAttendanceEntry[]);
    request.onerror = () => reject(request.error);
  });
}

export async function deletePending(clientRequestId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(clientRequestId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
