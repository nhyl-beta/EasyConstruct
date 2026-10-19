// apps/api/src/reference/backfill.ts: pure, no I/O (objectives fix 1.2)
//
// Plans the backfill of clients and vendors from the free text already stored:
// names that normalize to the same key are one company, shown under the
// spelling used most often. Nothing here writes; the script applies the plan
// and only when it is run with --apply.
import { normalizeName } from "./names.js";

export interface PlannedEntry {
  name: string;
  nameKey: string;
  /** How many stored values collapsed into this entry. */
  occurrences: number;
  /** Other spellings seen for the same key. */
  variants: string[];
}

export interface BackfillPlan {
  toCreate: PlannedEntry[];
  /** Entries whose key is already in the table (left untouched). */
  alreadyPresent: number;
  /** Blank values that were ignored. */
  skippedBlank: number;
}

export const planBackfill = (values: (string | null | undefined)[], existingKeys: ReadonlySet<string>): BackfillPlan => {
  const groups = new Map<string, Map<string, number>>();
  let skippedBlank = 0;
  for (const raw of values) {
    const name = raw?.trim().replace(/\s+/g, " ") ?? "";
    const key = normalizeName(name);
    if (!name || !key) {
      skippedBlank += 1;
      continue;
    }
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(name, (spellings.get(name) ?? 0) + 1);
    groups.set(key, spellings);
  }

  const toCreate: PlannedEntry[] = [];
  let alreadyPresent = 0;
  for (const [nameKey, spellings] of groups) {
    if (existingKeys.has(nameKey)) {
      alreadyPresent += 1;
      continue;
    }
    // Most used spelling wins; ties go to the alphabetically first so the plan is stable.
    const ranked = [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    toCreate.push({
      name: ranked[0]![0],
      nameKey,
      occurrences: ranked.reduce((n, [, c]) => n + c, 0),
      variants: ranked.slice(1).map(([spelling]) => spelling),
    });
  }
  toCreate.sort((a, b) => a.name.localeCompare(b.name));
  return { toCreate, alreadyPresent, skippedBlank };
};
