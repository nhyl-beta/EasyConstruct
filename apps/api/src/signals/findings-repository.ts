// apps/api/src/signals/findings-repository.ts (objectives fix 3.5)
import { and, inArray, isNull } from "drizzle-orm";
import { db } from "../core/db/connection.js";
import { signalFindings } from "../core/db/schema/signal-findings.js";

export const findForProjects = async (projectCodes: string[]) => {
  if (projectCodes.length === 0) return [];
  return db.select().from(signalFindings).where(inArray(signalFindings.projectCode, projectCodes));
};

/** Open (unresolved) findings for some projects, for the PM queue. */
export const findOpenForProjects = async (projectCodes: string[]) => {
  if (projectCodes.length === 0) return [];
  return db
    .select()
    .from(signalFindings)
    .where(and(inArray(signalFindings.projectCode, projectCodes), isNull(signalFindings.resolvedAt)));
};

export const insertFindings = async (
  rows: { key: string; projectCode: string; rule: string; severity: string }[],
  now: Date,
) => {
  if (rows.length === 0) return;
  // onConflictDoNothing: a concurrent scan that already inserted the key wins.
  await db
    .insert(signalFindings)
    .values(rows.map((r) => ({ ...r, firstSeen: now, lastSeen: now })))
    .onConflictDoNothing();
};

export const touchFindings = async (keys: string[], severity: "warn" | "critical", now: Date) => {
  if (keys.length === 0) return;
  await db.update(signalFindings).set({ lastSeen: now, severity }).where(inArray(signalFindings.key, keys));
};

export const reopenFindings = async (keys: string[], severity: "warn" | "critical", now: Date) => {
  if (keys.length === 0) return;
  await db
    .update(signalFindings)
    .set({ firstSeen: now, lastSeen: now, resolvedAt: null, severity })
    .where(inArray(signalFindings.key, keys));
};

export const resolveFindings = async (keys: string[], now: Date) => {
  if (keys.length === 0) return;
  await db.update(signalFindings).set({ resolvedAt: now }).where(inArray(signalFindings.key, keys));
};
