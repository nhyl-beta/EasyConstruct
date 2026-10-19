// Per-user "Recent" list for the quick-search palette. localStorage may be
// missing, full or blocked (private windows, site-data settings, embedded
// previews), so every access is wrapped: a failure means "no recents", never
// an error.

export interface RecentItem {
  /** Stable identity, used to de-duplicate: "action:<id>", "page:<route>", "<kind>:<id>". */
  key: string;
  label: string;
  subtitle?: string;
  route: string;
  kind: "action" | "page" | "record";
}

export const RECENT_LIMIT = 5;

const storageKey = (userKey: string) => `easyconstruct:quick-search:recent:${userKey}`;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

const isRecentItem = (v: unknown): v is RecentItem => {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.key === "string" &&
    typeof o.label === "string" &&
    typeof o.route === "string" &&
    (o.kind === "action" || o.kind === "page" || o.kind === "record")
  );
};

export function readRecent(userKey: string, storage: StorageLike | null = defaultStorage()): RecentItem[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey(userKey));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecentItem).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Puts `item` first, drops an older copy of it, keeps the newest RECENT_LIMIT. Returns the new list. */
export function pushRecent(
  userKey: string,
  item: RecentItem,
  storage: StorageLike | null = defaultStorage(),
): RecentItem[] {
  const next = [item, ...readRecent(userKey, storage).filter((r) => r.key !== item.key)].slice(0, RECENT_LIMIT);
  try {
    storage?.setItem(storageKey(userKey), JSON.stringify(next));
  } catch {
    // Blocked or full: the list still works for this session via the return value.
  }
  return next;
}
