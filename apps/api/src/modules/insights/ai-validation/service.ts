// apps/api/src/ai-validation/service.ts — NEW (ai-signals C4)
//
// The entry point workflows/service.ts calls after creating a workflow's
// line items. Its whole body is wrapped in try/catch — a failure here
// (network, quota, a bad row) must never fail workflow creation, since
// decision support can never block anything.
import { db } from "../../../core/db/connection.js";
import { validationResults, type NewValidationResultRow } from "../../../core/db/schema/ai-validation.js";
import { workflowLineItems } from "../../../core/db/schema/workflows.js";
import { eq } from "drizzle-orm";
import { getReferenceItems } from "./cache.js";
import { bestMatch } from "./matcher.js";
import { compareLineItem, type LineItemForCost, type FxRate } from "./cost.js";
import { env } from "../../../core/config/env.js";
import { repo } from "../../workflow/index.js";

const MAX_NOTE_LENGTH = 500;

const summarize = (results: NewValidationResultRow[]): string => {
  const comparable = results.filter((r) => r.verdict !== "no-match");
  const above = comparable.filter((r) => r.verdict === "above-typical");
  const within = comparable.filter((r) => r.verdict === "within-range");
  const below = comparable.filter((r) => r.verdict === "below-typical");
  const noMatch = results.filter((r) => r.verdict === "no-match");

  if (results.length === 0) return "No line items to compare.";

  const parts: string[] = [];
  if (comparable.length > 0) {
    parts.push(`${comparable.length} of ${results.length} line(s) compared to EstimationPro.ai`);
    const detailParts: string[] = [];
    if (above.length > 0) {
      const worst = above.reduce((max, r) => (Math.abs(Number(r.variancePct)) > Math.abs(Number(max.variancePct)) ? r : max));
      detailParts.push(`${above.length} above typical (${worst.variancePct != null && Number(worst.variancePct) > 0 ? "+" : ""}${(Number(worst.variancePct) * 100).toFixed(1)}%)`);
    }
    if (within.length > 0) detailParts.push(`${within.length} within range`);
    if (below.length > 0) detailParts.push(`${below.length} below typical`);
    if (detailParts.length > 0) parts[0] += `: ${detailParts.join(", ")}`;
  }
  if (noMatch.length > 0) {
    const firstReason = noMatch[0]!.basisSummary.replace("No comparable reference — ", "").replace(/\.$/, "");
    parts.push(`${noMatch.length} no-match (${firstReason})`);
  }

  const summary = parts.join("; ") + ".";
  return summary.length > MAX_NOTE_LENGTH ? summary.slice(0, MAX_NOTE_LENGTH - 1) + "…" : summary;
};

// Compares every line item on a workflow against the cached reference
// catalog, persists a validation_results row per line (including
// "no-match" rows), and writes a one-sentence summary to workflows.aiNote.
// Never throws — a failure anywhere (fetch, match, insert) is logged and
// the function returns without having written anything further.
export const validateWorkflowLineItems = async (workflowId: number): Promise<void> => {
  try {
    const workflow = await repo.findWorkflowById(workflowId);
    if (!workflow) return;

    const rows = await db.select().from(workflowLineItems).where(eq(workflowLineItems.workflowId, workflowId));
    if (rows.length === 0) return;

    const referenceItems = await getReferenceItems();
    const fx: FxRate = { rate: env.FX_RATE_USD_PHP, asOf: env.FX_RATE_AS_OF };

    const results: NewValidationResultRow[] = rows.map((row) => {
      const line: LineItemForCost = {
        id: row.id,
        workflowId: row.workflowId,
        projectCode: workflow.projectCode,
        description: row.description,
        requestedAmount: Number(row.requestedAmount),
        quantity: row.quantity != null ? Number(row.quantity) : null,
        unit: row.unit,
      };
      const match =
        referenceItems.length > 0 && line.quantity != null && line.unit
          ? bestMatch(line.description, referenceItems)
          : null;
      return compareLineItem(line, match, fx);
    });

    if (results.length > 0) {
      await db.insert(validationResults).values(results);
    }

    await repo.updateWorkflow(workflowId, { aiNote: summarize(results) });
  } catch (error) {
    console.error(`[ai-validation] validateWorkflowLineItems(${workflowId}) failed:`, error);
  }
};
