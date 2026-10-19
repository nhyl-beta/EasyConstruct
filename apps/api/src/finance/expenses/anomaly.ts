// apps/api/src/finance/expenses/anomaly.ts
//
// Rule-based expense anomaly detection (decision support, never a block).
// Pure — no database — so every rule is unit-tested (anomaly.test.ts). Output
// is a 0-1 score and the plain-language reasons behind it, so Finance can see
// WHY an expense was flagged. Two rules:
//   1. Duplicate payment: the same vendor, project and amount again within
//      30 days (or the same vendor and amount on another project within 7).
//   2. Far above history: the amount is several times the typical (median)
//      amount for that vendor, or for that category when the vendor is new.
// A rejected expense never counts as history.

export interface ExpenseLike {
  id: string;
  vendor: string;
  project: string;
  category: string;
  amount: number;
  submittedAt: Date;
  status: string;
}

export interface AnomalyResult {
  /** 0-1; 0 means nothing unusual. */
  score: number;
  reasons: string[];
}

const DAY = 86_400_000;
const norm = (s: string) => s.trim().toLowerCase();
const money = (n: number) => `PHP ${Math.round(n).toLocaleString("en-PH")}`;

export const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Ratio -> score: 3x = 0.6, 5x = 0.8, 8x or more = 0.95 (linear in between). */
export const ratioScore = (ratio: number): number => {
  if (ratio < 3) return 0;
  if (ratio >= 8) return 0.95;
  if (ratio <= 5) return 0.6 + ((ratio - 3) / 2) * 0.2;
  return 0.8 + ((ratio - 5) / 3) * 0.15;
};

export const scoreExpense = (candidate: ExpenseLike, history: ExpenseLike[]): AnomalyResult => {
  const others = history.filter((h) => h.id !== candidate.id && h.status !== "rejected");
  const reasons: string[] = [];
  let score = 0;

  // 1. Duplicate payment
  const sameVendor = others.filter((h) => norm(h.vendor) === norm(candidate.vendor) && h.amount === candidate.amount);
  const dayGap = (h: ExpenseLike) => Math.abs(candidate.submittedAt.getTime() - h.submittedAt.getTime()) / DAY;
  const dup = sameVendor.find((h) => h.project === candidate.project && dayGap(h) <= 30);
  if (dup) {
    score = Math.max(score, 0.95);
    reasons.push(`Same vendor, project and amount (${money(candidate.amount)}) as ${dup.id}, ${Math.round(dayGap(dup))} day(s) apart`);
  } else {
    const cross = sameVendor.find((h) => dayGap(h) <= 7);
    if (cross) {
      score = Math.max(score, 0.7);
      reasons.push(`Same vendor and amount (${money(candidate.amount)}) as ${cross.id} on ${cross.project} within a week`);
    }
  }

  // 2. Far above history (vendor first, then category)
  const vendorPeers = others.filter((h) => norm(h.vendor) === norm(candidate.vendor));
  const categoryPeers = others.filter((h) => norm(h.category) === norm(candidate.category));
  const basis =
    vendorPeers.length >= 3
      ? { peers: vendorPeers, label: `vendor ${candidate.vendor}` }
      : categoryPeers.length >= 4
        ? { peers: categoryPeers, label: `the ${candidate.category} category` }
        : null;
  if (basis) {
    const typical = median(basis.peers.map((p) => p.amount));
    if (typical > 0) {
      const ratio = candidate.amount / typical;
      const s = ratioScore(ratio);
      if (s > 0) {
        score = Math.max(score, s);
        reasons.push(`${money(candidate.amount)} is ${ratio.toFixed(1)}× the typical ${money(typical)} for ${basis.label} (${basis.peers.length} past expenses)`);
      }
    }
  }

  return { score: Number(score.toFixed(2)), reasons };
};
