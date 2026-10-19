// Per-user saved filters (objectives fix 2.7).
//
// A person can name the current filters on a list page and bring them back with
// one click. They live in this browser's localStorage under a key that includes
// the signed-in user, so two people sharing a machine do not see each other's.
// Every read and write is wrapped: storage can be missing, full or blocked
// (private windows, strict settings), and the page works the same without it.

export interface SavedFilter<T> {
  name: string;
  values: T;
}

/** The slice of the Storage API used, so a test can pass a plain object. */
export interface FilterStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const MAX_SAVED_FILTERS = 12;

export const storageKey = (userId: number | string, page: string): string => `ec:saved-filters:v1:${userId}:${page}`;

const browserStorage = (): FilterStorage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export function loadSavedFilters<T>(userId: number | string, page: string, storage: FilterStorage | null = browserStorage()): SavedFilter<T>[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey(userId, page));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is SavedFilter<T> => !!f && typeof f === "object" && typeof (f as SavedFilter<T>).name === "string" && "values" in f,
    );
  } catch {
    return [];
  }
}

function write<T>(userId: number | string, page: string, filters: SavedFilter<T>[], storage: FilterStorage | null): boolean {
  if (!storage) return false;
  try {
    storage.setItem(storageKey(userId, page), JSON.stringify(filters));
    return true;
  } catch {
    return false;
  }
}

/** Saves under a name (replacing one with the same name), newest first, capped. Returns the new list. */
export function saveFilter<T>(
  userId: number | string,
  page: string,
  name: string,
  values: T,
  storage: FilterStorage | null = browserStorage(),
): SavedFilter<T>[] {
  const clean = name.trim().slice(0, 40);
  const current = loadSavedFilters<T>(userId, page, storage);
  if (!clean) return current;
  const next = [{ name: clean, values }, ...current.filter((f) => f.name.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_SAVED_FILTERS);
  return write(userId, page, next, storage) ? next : current;
}

export function deleteFilter<T>(
  userId: number | string,
  page: string,
  name: string,
  storage: FilterStorage | null = browserStorage(),
): SavedFilter<T>[] {
  const current = loadSavedFilters<T>(userId, page, storage);
  const next = current.filter((f) => f.name !== name);
  return write(userId, page, next, storage) ? next : current;
}
