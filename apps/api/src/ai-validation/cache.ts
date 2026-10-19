// apps/api/src/ai-validation/cache.ts — NEW (ai-signals group B)
//
// The read path every comparison uses (matcher.ts via service.ts) — never
// call reference-client.ts directly outside this file, so the TTL and
// budget logic stay in one place.
import { db } from "../core/db/connection.js";
import { referenceSnapshots, type ReferenceSnapshotRow } from "../core/db/schema/ai-validation.js";
import { desc } from "drizzle-orm";
import { fetchTrades, fetchCostsForTrade } from "./reference-client.js";
import { REFERENCE_CACHE_TTL_MS } from "../core/config/signals.js";

let refreshInFlight: Promise<void> | null = null;

const isStale = (rows: ReferenceSnapshotRow[]): boolean => {
  if (rows.length === 0) return true;
  const newest = rows.reduce(
    (max, r) => (r.fetchedAt.getTime() > max ? r.fetchedAt.getTime() : max),
    0,
  );
  return Date.now() - newest > REFERENCE_CACHE_TTL_MS;
};

// One lazy refresh at a time — a burst of concurrent validation calls
// shares a single in-flight fetch instead of each kicking off its own.
const refreshOnce = async (): Promise<void> => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const trades = await fetchTrades();
      for (const trade of trades) {
        await fetchCostsForTrade(trade);
      }
    } catch (error) {
      console.error("[ai-validation] lazy reference refresh failed:", error);
    }
  })();
  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
};

// Serves cached rows, attempting one lazy refresh if the cache is empty or
// older than the TTL. If that refresh fails or the budget is exhausted, it
// serves whatever's already cached (stale, but real — never fabricated).
export const getReferenceItems = async (): Promise<ReferenceSnapshotRow[]> => {
  const cached = await db.select().from(referenceSnapshots).orderBy(desc(referenceSnapshots.fetchedAt));
  if (isStale(cached)) {
    await refreshOnce();
    const refreshed = await db.select().from(referenceSnapshots).orderBy(desc(referenceSnapshots.fetchedAt));
    if (refreshed.length > 0) return refreshed;
  }
  return cached;
};
