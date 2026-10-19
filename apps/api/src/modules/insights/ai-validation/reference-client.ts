// apps/api/src/ai-validation/reference-client.ts — NEW (ai-signals group B)
//
// The only module in this codebase that reaches EstimationPro.ai. Never
// throws into its callers — a network failure, a timeout, or a response
// that doesn't parse all just mean "no fresh data this time", handled by
// cache.ts falling back to whatever's already cached. See docs/
// ai-signals-progress.md A2 for the verified live response shape (AV-1:
// `multiplier`/`location` are fields on the trade-level response, not per
// item, so every item from one fetchCostsForTrade call shares one
// regionMultiplier).
import { db } from "../../../core/db/connection.js";
import { referenceSnapshots, type NewReferenceSnapshotRow } from "../../../core/db/schema/ai-validation.js";
import { sql } from "drizzle-orm";
import { DAILY_REQUEST_BUDGET } from "../../../core/config/signals.js";

// Overridable so tests and offline runs can point at a stand-in server (ESTIMATIONPRO_BASE_URL).
const BASE_URL = (process.env.ESTIMATIONPRO_BASE_URL ?? "https://estimationpro.ai/api/v1").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 5_000;
const SOURCE = "estimationpro";

interface EstimationProItem {
  id: string;
  description: string;
  unit: string;
  low: number;
  high: number;
  typical: number;
  volatility?: string;
  lastVerified?: string;
  regionallyAdjusted?: boolean;
}

interface EstimationProCostsResponse {
  data: {
    trade: string;
    location: string;
    multiplier: number;
    itemCount: number;
    items: EstimationProItem[];
  };
  meta: { source: string; url: string };
}

interface EstimationProTradesResponse {
  data: { trades: { trade: string; itemCount: number }[]; totalItems: number };
  meta: { source: string; url: string };
}

// In-memory only, per process — resets on restart. A margin under the
// documented 100/day quota (500 for /index), not a hard account-level cap,
// so this is a courtesy limiter, not the actual enforcement.
let requestsToday = 0;
let dayStamp = new Date().toDateString();

const withinBudget = (): boolean => {
  const today = new Date().toDateString();
  if (today !== dayStamp) {
    dayStamp = today;
    requestsToday = 0;
  }
  if (requestsToday >= DAILY_REQUEST_BUDGET) {
    console.error(`[ai-validation] daily request budget (${DAILY_REQUEST_BUDGET}) reached, skipping EstimationPro.ai call`);
    return false;
  }
  requestsToday += 1;
  return true;
};

async function fetchJson<T>(path: string): Promise<T | null> {
  if (!withinBudget()) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, { signal: controller.signal });
    if (!res.ok) {
      console.error(`[ai-validation] EstimationPro.ai ${path} returned ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (error) {
    console.error(`[ai-validation] EstimationPro.ai ${path} failed:`, error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export const fetchTrades = async (): Promise<string[]> => {
  const json = await fetchJson<EstimationProTradesResponse>("/trades");
  return json?.data?.trades?.map((t) => t.trade) ?? [];
};

// Fetches one trade's items and upserts them into reference_snapshots.
// Returns the rows actually written (empty on any failure) — callers should
// treat an empty array as "no fresh data", not as "this trade has no items".
export const fetchCostsForTrade = async (trade: string): Promise<NewReferenceSnapshotRow[]> => {
  const json = await fetchJson<EstimationProCostsResponse>(`/costs?trade=${encodeURIComponent(trade)}`);
  if (!json?.data?.items?.length) return [];

  const fetchedAt = new Date();
  const rows: NewReferenceSnapshotRow[] = json.data.items.map((item) => ({
    source: SOURCE,
    sourceItemId: item.id,
    trade: json.data.trade,
    description: item.description,
    unit: item.unit,
    lowUsd: String(item.low),
    typicalUsd: String(item.typical),
    highUsd: String(item.high),
    regionMultiplier: json.data.multiplier != null ? String(json.data.multiplier) : null,
    volatility: item.volatility ?? null,
    currency: "USD",
    sourceUrl: json.meta?.url ?? `${BASE_URL}/costs?trade=${encodeURIComponent(trade)}`,
    rawPayload: item,
    fetchedAt,
  }));

  try {
    await db
      .insert(referenceSnapshots)
      .values(rows)
      .onConflictDoUpdate({
        target: [referenceSnapshots.source, referenceSnapshots.sourceItemId],
        set: {
          trade: sql`excluded.trade`,
          description: sql`excluded.description`,
          unit: sql`excluded.unit`,
          lowUsd: sql`excluded.low_usd`,
          typicalUsd: sql`excluded.typical_usd`,
          highUsd: sql`excluded.high_usd`,
          regionMultiplier: sql`excluded.region_multiplier`,
          volatility: sql`excluded.volatility`,
          currency: sql`excluded.currency`,
          sourceUrl: sql`excluded.source_url`,
          rawPayload: sql`excluded.raw_payload`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
    return rows;
  } catch (error) {
    console.error(`[ai-validation] failed to upsert reference_snapshots for trade "${trade}":`, error);
    return [];
  }
};
