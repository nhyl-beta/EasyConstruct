// apps/api/src/ai-validation/matcher.ts — NEW (ai-signals C2)
//
// Pure, no I/O. Normalized-token Dice coefficient (S-3): 2*|A∩B| / (|A|+|B|)
// over token multisets, floor 0.40. Below the floor there is no match, full
// stop — no partial/best-effort range is ever shown for a weak match.
import type { ReferenceSnapshotRow } from "../../../core/db/schema/ai-validation.js";
import { SIMILARITY_FLOOR } from "../../../core/config/signals.js";

const STOPWORDS = new Set([
  "a", "an", "and", "the", "of", "for", "with", "to", "in", "on", "at", "per",
  "or", "is", "are", "be", "as", "by", "this", "that", "into", "from",
]);

// Keeps numeric-prefixed tokens like "12mm" or "4x8" intact (they carry real
// meaning for a materials description) while stripping punctuation and
// dropping short stopwords.
export const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));

// Dice coefficient over token multisets (repeated tokens count multiple
// times in the intersection, up to the smaller multiplicity).
export const dice = (a: string, b: string): number => {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const countsA = new Map<string, number>();
  for (const t of tokensA) countsA.set(t, (countsA.get(t) ?? 0) + 1);
  const countsB = new Map<string, number>();
  for (const t of tokensB) countsB.set(t, (countsB.get(t) ?? 0) + 1);

  let intersection = 0;
  for (const [token, countA] of countsA) {
    const countB = countsB.get(token);
    if (countB) intersection += Math.min(countA, countB);
  }

  return (2 * intersection) / (tokensA.length + tokensB.length);
};

export interface MatchResult {
  item: ReferenceSnapshotRow;
  score: number;
}

// Returns the single best match at or above SIMILARITY_FLOOR, or null.
// Ties (equal score) break on the lower id, so the result is deterministic
// regardless of array order.
export const bestMatch = (description: string, items: ReferenceSnapshotRow[]): MatchResult | null => {
  let best: MatchResult | null = null;
  for (const item of items) {
    const score = dice(description, item.description);
    if (score < SIMILARITY_FLOOR) continue;
    if (!best || score > best.score || (score === best.score && item.id < best.item.id)) {
      best = { item, score };
    }
  }
  return best;
};
