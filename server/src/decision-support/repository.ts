// server/src/decision-support/repository.ts (objectives fix 3.7)
import { sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { decisionSupportEvents } from "../db/schema/decision-support-events.js";
import type { EventAction, EventCount, EventKind } from "./summary.js";

export interface NewEvent {
  kind: EventKind;
  itemKey: string;
  projectCode?: string | null;
  action: EventAction;
}

/** Idempotent: the unique index on (kind, item, user, action) makes a repeat a no-op. */
export const insertEvents = async (userId: number, events: NewEvent[]) => {
  if (events.length === 0) return;
  await db
    .insert(decisionSupportEvents)
    .values(events.map((e) => ({ kind: e.kind, itemKey: e.itemKey, projectCode: e.projectCode ?? null, userId, action: e.action })))
    .onConflictDoNothing();
};

export const countByKindAndAction = async (): Promise<EventCount[]> => {
  const rows = await db.execute(
    sql`SELECT kind, action, COUNT(*)::int AS count FROM decision_support_events GROUP BY kind, action`,
  );
  return (rows.rows as { kind: string; action: string; count: number }[]).map((r) => ({
    kind: r.kind,
    action: r.action,
    count: Number(r.count),
  }));
};
