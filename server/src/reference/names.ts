// server/src/reference/names.ts: pure, no I/O (objectives fix 1.2)
//
// Name handling for shared reference data (clients, vendors) and the duplicate
// checks on employee, vendor and project creation. "ABC Steel Supply, Inc." and
// "abc steel supply" are the same company; the normalized form is what is
// compared and what the unique key is built from. Similarity is advice: a
// similar name asks for confirmation, only an identical normalized name blocks.

/** Trailing words that do not change who a company is. */
const COMPANY_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "limited",
  "llc",
  "llp",
  "plc",
]);

/** Lowercase, accents and punctuation removed, "&" read as "and", trailing company suffixes dropped, spaces collapsed. */
export const normalizeName = (name: string): string => {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (base.length > 1 && COMPANY_SUFFIXES.has(base[base.length - 1]!)) base.pop();
  return base.join(" ");
};

export interface NameMatch {
  id: number;
  name: string;
  /** 1 for an identical normalized name, otherwise the Dice similarity. */
  score: number;
  exact: boolean;
}

/** Similarity at or above which two different names are offered as "did you mean". */
export const SIMILAR_NAME_THRESHOLD = 0.85;

const bigrams = (s: string): Map<string, number> => {
  const compact = s.replace(/\s+/g, " ");
  const counts = new Map<string, number>();
  for (let i = 0; i < compact.length - 1; i++) {
    const g = compact.slice(i, i + 2);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return counts;
};

/**
 * Dice coefficient over character pairs. Unlike a word-level score it tolerates
 * a plural, a typo or a missing letter ("Westgate Health Group" vs "Westgate
 * Health Groups"), which is how duplicate names usually differ.
 */
export const nameSimilarity = (a: string, b: string): number => {
  const x = bigrams(a);
  const y = bigrams(b);
  const sizeX = [...x.values()].reduce((n, v) => n + v, 0);
  const sizeY = [...y.values()].reduce((n, v) => n + v, 0);
  if (sizeX === 0 || sizeY === 0) return 0;
  let shared = 0;
  for (const [g, n] of x) shared += Math.min(n, y.get(g) ?? 0);
  return (2 * shared) / (sizeX + sizeY);
};

/** Existing names that are the same as, or close to, a candidate. Exact matches first, then by similarity. */
export const findNameMatches = (
  candidate: string,
  existing: { id: number; name: string }[],
  threshold: number = SIMILAR_NAME_THRESHOLD,
): NameMatch[] => {
  const key = normalizeName(candidate);
  if (!key) return [];
  const out: NameMatch[] = [];
  for (const e of existing) {
    const otherKey = normalizeName(e.name);
    if (otherKey === key) {
      out.push({ id: e.id, name: e.name, score: 1, exact: true });
      continue;
    }
    const score = nameSimilarity(key, otherKey);
    if (score >= threshold) out.push({ id: e.id, name: e.name, score: Math.round(score * 100) / 100, exact: false });
  }
  return out.sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || a.id - b.id);
};
