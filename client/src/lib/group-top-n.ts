export interface Slice {
  name: string;
  value: number;
}

/**
 * Sums items that share a name, sorts them largest first, keeps the top `n`
 * and folds everything else into one `otherLabel` slice. Items with a value
 * of zero or less are dropped (a chart slice cannot show them), so the
 * returned values always add up to the sum of the positive input values. When
 * there are `n` or fewer names there is no "Other" slice. Ties keep input order.
 */
export function groupTopN(items: Slice[], n: number, otherLabel = "Other"): Slice[] {
  const sums = new Map<string, number>();
  for (const { name, value } of items) {
    if (!(value > 0)) continue;
    sums.set(name, (sums.get(name) ?? 0) + value);
  }

  // Array.prototype.sort is stable, so equal values keep first-seen order.
  const sorted = [...sums].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const keep = Math.max(0, Math.floor(n));
  if (sorted.length <= keep) return sorted;

  const top = sorted.slice(0, keep);
  const rest = sorted.slice(keep).reduce((sum, s) => sum + s.value, 0);
  return [...top, { name: otherLabel, value: rest }];
}
