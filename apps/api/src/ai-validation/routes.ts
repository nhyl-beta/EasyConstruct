// apps/api/src/ai-validation/routes.ts — NEW (ai-signals E6)
//
// Admin-only, decision-support-only: refreshing the cached cost catalog
// never blocks anything and never runs automatically from here — the lazy
// refresh in cache.ts already covers normal use. This is a manual "do it
// now" for when someone wants fresher data without waiting for the 7-day
// TTL to lapse.
import { Router } from "express";
import { mapWithConcurrency } from "../core/utils/concurrency.js";
import { authenticate, requireRole } from "../core/auth/middleware.js";
import { formatSuccess } from "../core/utils/response.js";
import { db } from "../core/db/connection.js";
import { referenceSnapshots } from "../core/db/schema/ai-validation.js";
import { desc, count } from "drizzle-orm";
import { fetchTrades, fetchCostsForTrade } from "./reference-client.js";
import { SIGNAL_THRESHOLDS, SIMILARITY_FLOOR, REFERENCE_CACHE_TTL_MS } from "../core/config/signals.js";
import { FEATURES } from "../core/config/features.js";

const router = Router();
router.use(authenticate);

// Part B: the in-app "AI Validation Reference" page needs these real
// constants at render time, not hand-copied prose that goes stale. Open to
// any authenticated role (unlike the admin-only refresh/status routes
// below) — this is read-only config plus a public-safe count/timestamp,
// the same shape every role's Decision Support section already implies.
router.get("/config", async (_req, res, next) => {
  try {
    const [totalRow] = await db.select({ value: count() }).from(referenceSnapshots);
    const [newest] = await db
      .select({ fetchedAt: referenceSnapshots.fetchedAt })
      .from(referenceSnapshots)
      .orderBy(desc(referenceSnapshots.fetchedAt))
      .limit(1);
    res.json(
      formatSuccess(
        {
          aiEnabled: FEATURES.ai,
          signalThresholds: SIGNAL_THRESHOLDS,
          similarityFloor: SIMILARITY_FLOOR,
          referenceCacheTtlMs: REFERENCE_CACHE_TTL_MS,
          referenceCatalog: {
            totalItems: totalRow?.value ?? 0,
            lastFetchedAt: newest?.fetchedAt?.toISOString() ?? null,
          },
        },
        "AI validation configuration retrieved",
      ),
    );
  } catch (err) {
    next(err);
  }
});

router.use(requireRole("admin"));

router.get("/references-status", async (_req, res, next) => {
  try {
    const [totalRow] = await db.select({ value: count() }).from(referenceSnapshots);
    const total = totalRow?.value ?? 0;
    const [newest] = await db
      .select({ fetchedAt: referenceSnapshots.fetchedAt })
      .from(referenceSnapshots)
      .orderBy(desc(referenceSnapshots.fetchedAt))
      .limit(1);
    res.json(
      formatSuccess(
        { totalItems: total, lastFetchedAt: newest?.fetchedAt?.toISOString() ?? null },
        "Reference catalog status retrieved",
      ),
    );
  } catch (err) {
    next(err);
  }
});

router.post("/refresh-references", async (_req, res, next) => {
  try {
    const trades = await fetchTrades();
    let itemCount = 0;
    let tradesRefreshed = 0;
    // Five trades at a time: 35 sequential external calls took about 12 s. fetchCostsForTrade
    // never throws (it returns [] on any failure), so one bad trade does not stop the rest.
    const results = await mapWithConcurrency(trades, 5, (trade) => fetchCostsForTrade(trade));
    for (const rows of results) {
      if (rows.length > 0) {
        itemCount += rows.length;
        tradesRefreshed += 1;
      }
    }
    res.json(
      formatSuccess(
        { tradesRefreshed, tradesTotal: trades.length, itemCount },
        "Reference catalog refresh finished",
      ),
    );
  } catch (err) {
    next(err);
  }
});

export default router;
