// apps/api/src/jobs/lock.ts (objectives fixes 2.3 and 3.5)
//
// Lets only one instance run a scheduled job at a time. Uses a transaction-level
// advisory lock held for the duration of the job: unlike a session-level lock it
// is released automatically with the transaction, so it stays correct when
// queries are spread over a connection pool or a pooled Neon endpoint.
import { sql } from "drizzle-orm";
import { db } from "../db/connection.js";

/** Runs `job` if the lock is free; returns null when another instance holds it. */
export const withJobLock = async <T>(lockKey: number, job: () => Promise<T>): Promise<T | null> =>
  db.transaction(async (tx) => {
    const rows = (await tx.execute(sql`SELECT pg_try_advisory_xact_lock(${lockKey}) AS locked`)).rows as [
      { locked: boolean },
    ];
    if (!rows[0]?.locked) return null;
    return job();
  });
