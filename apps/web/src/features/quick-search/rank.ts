// Pure matching and ranking for the quick-actions palette (no React).
import type { Rankable } from "./types";

/** Higher is better. Exact prefix > word prefix > substring > keyword. */
const SCORE = {
  prefix: 400,
  wordPrefix: 300,
  substring: 200,
  keywordPrefix: 120,
  keywordSubstring: 100,
} as const;

/** Actions above pages above records when the score ties. */
const KIND_ORDER = { action: 0, page: 1, record: 2 } as const;

export const normalize = (text: string): string =>
  text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export interface ParsedQuery {
  /** Leading ">" limits the palette to quick actions. */
  actionsOnly: boolean;
  text: string;
}

export function parseQuery(raw: string): ParsedQuery {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith(">")) return { actionsOnly: true, text: normalize(trimmed.slice(1)) };
  return { actionsOnly: false, text: normalize(trimmed) };
}

const words = (text: string): string[] => text.split(/[^a-z0-9]+/).filter(Boolean);

function scoreField(query: string, field: string, kind: "label" | "keyword"): number | null {
  if (!field) return null;
  const prefix = kind === "label" ? SCORE.prefix : SCORE.keywordPrefix;
  const sub = kind === "label" ? SCORE.substring : SCORE.keywordSubstring;
  if (field.startsWith(query)) return prefix;
  if (kind === "label" && words(field).some((w) => w.startsWith(query))) return SCORE.wordPrefix;
  if (kind === "keyword" && words(field).some((w) => w.startsWith(query))) return prefix;
  if (field.includes(query)) return sub;
  return null;
}

/** Best score of one query token against the label and keywords, or null. */
function scoreToken(token: string, label: string, keywords: readonly string[]): number | null {
  let best: number | null = scoreField(token, label, "label");
  for (const k of keywords) {
    const s = scoreField(token, normalize(k), "keyword");
    if (s !== null && (best === null || s > best)) best = s;
  }
  return best;
}

/**
 * Score an item for a normalized query; null means no match. The whole query
 * is tried first (so "new pro" is a prefix of "New project"), then every
 * space-separated token must match and the weakest token sets the score.
 */
export function scoreItem(query: string, item: Pick<Rankable, "label" | "keywords">): number | null {
  if (!query) return 0;
  const label = normalize(item.label);
  const whole = scoreToken(query, label, item.keywords);
  if (whole !== null && whole >= SCORE.prefix) return whole;
  const tokens = query.split(" ").filter(Boolean);
  if (tokens.length <= 1) return whole;
  let min: number | null = null;
  for (const t of tokens) {
    const s = scoreToken(t, label, item.keywords);
    if (s === null) return whole;
    min = min === null ? s : Math.min(min, s);
  }
  return whole !== null && min !== null ? Math.max(whole, min) : min;
}

/** Matching items, best first. Ties: kind (action, page, record), then label. */
export function rankItems<T extends Rankable>(items: readonly T[], rawQuery: string): T[] {
  const query = normalize(rawQuery);
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const score = scoreItem(query, item);
    if (score !== null) scored.push({ item, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind] ||
      a.item.label.localeCompare(b.item.label),
  );
  return scored.map((s) => s.item);
}

export const RECORDS_PER_GROUP = 5;

/** The first `limit` of each group, in the order the groups first appear. */
export function capPerGroup<T>(items: readonly T[], groupOf: (item: T) => string, limit = RECORDS_PER_GROUP): T[] {
  const seen = new Map<string, number>();
  const out: T[] = [];
  for (const item of items) {
    const g = groupOf(item);
    const n = seen.get(g) ?? 0;
    if (n >= limit) continue;
    seen.set(g, n + 1);
    out.push(item);
  }
  return out;
}
