// apps/api/src/ai-validation/cost.ts — NEW (ai-signals C3)
//
// Pure function: given a line item, its matched catalog item (or none), and
// the fx rate to use, produce the validation_results row. No I/O, no
// randomness, no "AI" — every number here is arithmetic over inputs the
// caller already has.
import type { NewValidationResultRow, ReferenceSnapshotRow } from "../../../core/db/schema/ai-validation.js";
import { convertQuantity } from "./units.js";
import type { MatchResult } from "./matcher.js";
import { SIGNAL_THRESHOLDS } from "../../../core/config/signals.js";

export interface LineItemForCost {
  id: number;
  workflowId: number;
  projectCode: string;
  description: string;
  requestedAmount: number;
  quantity: number | null;
  unit: string | null;
}

export interface FxRate {
  rate: number;
  asOf: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const noMatchResult = (line: LineItemForCost, fx: FxRate, basisSummary: string): NewValidationResultRow => ({
  entityType: "workflow_line_item",
  entityId: line.id,
  workflowId: line.workflowId,
  projectCode: line.projectCode,
  lineDescription: line.description,
  lineQuantity: line.quantity != null ? String(line.quantity) : null,
  lineUnit: line.unit,
  projectValuePhp: String(line.requestedAmount),
  matchedSnapshotId: null,
  matchScore: null,
  referenceUnit: null,
  unitFactor: null,
  referenceLowUsd: null,
  referenceMidUsd: null,
  referenceHighUsd: null,
  referenceLowPhp: null,
  referenceMidPhp: null,
  referenceHighPhp: null,
  fxRateUsed: String(fx.rate),
  fxRateAsOf: fx.asOf,
  variancePct: null,
  verdict: "no-match",
  basisSummary,
  sources: null,
});

const formatCitation = (item: ReferenceSnapshotRow, score: number, fx: FxRate): string =>
  `Matched '${item.description}' (score ${score.toFixed(2)}) · EstimationPro.ai, fetched ${item.fetchedAt.toISOString().slice(0, 10)} · ₱${fx.rate}/$1 as of ${fx.asOf}`;

// Compares one line item against its best catalog match (if any). Returns a
// full validation_results row every time — a "no-match" row is not an
// error, it's the honest answer when there's no basis for a comparison.
export const compareLineItem = (
  line: LineItemForCost,
  match: MatchResult | null,
  fx: FxRate,
): NewValidationResultRow => {
  if (line.quantity == null) {
    return noMatchResult(line, fx, "No comparable reference — line has no quantity.");
  }
  if (!line.unit) {
    return noMatchResult(line, fx, "No comparable reference — line has no unit.");
  }
  if (!match) {
    return noMatchResult(line, fx, "No comparable reference — no catalog item matched closely enough.");
  }

  const refQty = convertQuantity(line.quantity, line.unit, match.item.unit);
  if (refQty == null) {
    return noMatchResult(
      line,
      fx,
      `No comparable reference — '${line.unit}' can't be converted to '${match.item.unit}' (${match.item.description}).`,
    );
  }

  const multiplier = match.item.regionMultiplier != null ? Number(match.item.regionMultiplier) : 1;
  const lowUsd = refQty * Number(match.item.lowUsd) * multiplier;
  const midUsd = refQty * Number(match.item.typicalUsd) * multiplier;
  const highUsd = refQty * Number(match.item.highUsd) * multiplier;

  const lowPhp = round2(lowUsd * fx.rate);
  const midPhp = round2(midUsd * fx.rate);
  const highPhp = round2(highUsd * fx.rate);

  const variancePct = midPhp !== 0 ? (line.requestedAmount - midPhp) / midPhp : null;

  let verdict: NewValidationResultRow["verdict"];
  if (variancePct == null) {
    verdict = "no-match";
  } else if (Math.abs(variancePct) <= SIGNAL_THRESHOLDS.costVariance.warnPct) {
    verdict = "within-range";
  } else if (variancePct > 0) {
    verdict = "above-typical";
  } else {
    verdict = "below-typical";
  }

  const variancePctDisplay = variancePct != null ? `${(variancePct * 100).toFixed(1)}%` : "n/a";
  const signedVariance = variancePct != null && variancePct > 0 ? `+${variancePctDisplay}` : variancePctDisplay;
  const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;

  const basisSummary =
    `${formatCitation(match.item, match.score, fx)} · reference ${peso(lowPhp)}–${peso(highPhp)} ` +
    `(typical ${peso(midPhp)}) · submitted ${peso(line.requestedAmount)} · ${signedVariance}.`;

  return {
    entityType: "workflow_line_item",
    entityId: line.id,
    workflowId: line.workflowId,
    projectCode: line.projectCode,
    lineDescription: line.description,
    lineQuantity: String(line.quantity),
    lineUnit: line.unit,
    projectValuePhp: String(line.requestedAmount),
    matchedSnapshotId: match.item.id,
    matchScore: String(match.score.toFixed(3)),
    referenceUnit: match.item.unit,
    unitFactor: String(refQty / line.quantity),
    referenceLowUsd: String(round2(lowUsd)),
    referenceMidUsd: String(round2(midUsd)),
    referenceHighUsd: String(round2(highUsd)),
    referenceLowPhp: String(lowPhp),
    referenceMidPhp: String(midPhp),
    referenceHighPhp: String(highPhp),
    fxRateUsed: String(fx.rate),
    fxRateAsOf: fx.asOf,
    variancePct: variancePct != null ? String(variancePct) : null,
    verdict,
    basisSummary,
    sources: [
      {
        source: "EstimationPro.ai",
        itemName: match.item.description,
        sourceUrl: match.item.sourceUrl,
        fetchedAt: match.item.fetchedAt.toISOString(),
        fxRate: fx.rate,
        fxAsOf: fx.asOf,
      },
    ],
  };
};
