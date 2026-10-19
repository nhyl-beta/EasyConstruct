// apps/api/src/design-requests/scheduler.ts
//
// Hourly in-process job: tell the assignee and the Admin, once per request,
// when an RFI/RFA becomes overdue. Guarded so it runs once however many
// instances start: a module flag stops a second timer in the same process and
// a Postgres advisory lock lets only one instance sweep at a time
// (`overdue_notified_at` additionally makes a repeat sweep a no-op).
// Not started on Vercel (serverless has no long-lived process): there the same
// sweep is reachable as POST /api/design-requests/sweep for an external cron.
import { db } from "../core/db/connection.js";
import { sql } from "drizzle-orm";
import { sweepOverdue } from "./service.js";

const HOUR_MS = 60 * 60 * 1000;
const LOCK_KEY = 74_2025_01; // arbitrary, stable
let started = false;

export async function runOverdueSweepOnce(): Promise<{ notified: number } | null> {
  const [{ locked }] = (await db.execute(sql`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked`)).rows as [{ locked: boolean }];
  if (!locked) return null;
  try {
    return await sweepOverdue();
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${LOCK_KEY})`);
  }
}

export function startOverdueSweeper(): void {
  if (started || process.env.VERCEL || process.env.DISABLE_SCHEDULER === "true") return;
  started = true;
  const tick = () =>
    runOverdueSweepOnce()
      .then((r) => {
        if (r && r.notified > 0) console.log(`[design-requests] overdue notifications sent: ${r.notified}`);
      })
      .catch((err) => console.error("[design-requests] overdue sweep failed", err));
  setTimeout(tick, 30_000).unref();
  setInterval(tick, HOUR_MS).unref();
}
