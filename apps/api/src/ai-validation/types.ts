// apps/api/src/ai-validation/types.ts — NEW (ai-signals C7)
import type { ValidationVerdict } from "../db/schema/ai-validation.js";

export interface LineItemValidationSource {
  source: string;
  itemName: string;
  sourceUrl: string | null;
  fetchedAt: string;
  fxRate?: number;
  fxAsOf?: string;
}

// What the client actually needs to render the ReferenceBasisBadge — a
// trimmed view of validation_results, not the raw row (no internal ids).
export interface LineItemValidationSummary {
  verdict: ValidationVerdict;
  variancePct: number | null;
  referenceLowPhp: number | null;
  referenceMidPhp: number | null;
  referenceHighPhp: number | null;
  basisSummary: string;
  sources: LineItemValidationSource[] | null;
}
