// A small shared cache of file integrity statuses (client demo change #2).
//
// Every file link asks for its badge at about the same time; asking one url at a time would be a request
// per row. Urls asked for within a few milliseconds are sent as one request, and each answer is kept so a
// url is only asked for once per page visit (a check or a download refreshes it).
import { integrityRepository, type FileIntegrityStatus } from "../repositories/uploads.repository";

const MAX_PER_REQUEST = 200;
const BATCH_DELAY_MS = 30;

const cache = new Map<string, FileIntegrityStatus>();
const requested = new Set<string>();
const queue = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

const notify = () => listeners.forEach((l) => l());

export const subscribeIntegrity = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getIntegrity = (url: string | null | undefined): FileIntegrityStatus | undefined => (url ? cache.get(url) : undefined);

export const setIntegrity = (url: string, status: FileIntegrityStatus) => {
  cache.set(url, status);
  notify();
};

const flush = async () => {
  timer = null;
  const urls = [...queue];
  queue.clear();
  for (let i = 0; i < urls.length; i += MAX_PER_REQUEST) {
    const chunk = urls.slice(i, i + MAX_PER_REQUEST);
    try {
      const result = await integrityRepository.statuses(chunk);
      for (const url of chunk) cache.set(url, result[url] ?? "unverified");
    } catch {
      // The badge is only a hint; if the lookup fails the link simply shows no badge.
    }
  }
  notify();
};

/** Ask for a url's status; the answer arrives through the store (see useFileIntegrity). */
export const requestIntegrity = (url: string | null | undefined) => {
  if (!url || requested.has(url)) return;
  requested.add(url);
  queue.add(url);
  if (!timer) timer = setTimeout(() => void flush(), BATCH_DELAY_MS);
};

/** Fetch the status now, bypassing the cache (before a download, and after one). */
export const refreshIntegrity = async (url: string): Promise<FileIntegrityStatus | undefined> => {
  try {
    const result = await integrityRepository.statuses([url]);
    const status = result[url] ?? "unverified";
    setIntegrity(url, status);
    requested.add(url);
    return status;
  } catch {
    return undefined;
  }
};

/** Test helper. */
export const resetIntegrityStore = () => {
  cache.clear();
  requested.clear();
  queue.clear();
  if (timer) clearTimeout(timer);
  timer = null;
};
