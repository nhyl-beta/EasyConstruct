// apps/web/src/features/proposals/components/cost-breakdown-input.tsx
//
// The "Estimated Amount" used to be a bare text input — an architect could
// type any number with nothing behind it. This replaces it with an itemized
// breakdown (what, how much, at what rate): the total is computed, never
// typed, and each row is the proof a reviewer can actually check — separate
// from (not a substitute for) the optional supporting file.
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format-currency";

export interface CostBreakdownRow {
  id: string;
  description: string;
  quantity: string;
  unitCost: string;
}

export const emptyBreakdownRow = (): CostBreakdownRow => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: "",
  unitCost: "",
});

function rowSubtotal(row: CostBreakdownRow): number {
  const qty = Number(row.quantity);
  const cost = Number(row.unitCost);
  if (!Number.isFinite(qty) || !Number.isFinite(cost) || qty <= 0 || cost <= 0) return 0;
  return qty * cost;
}

/** A row counts toward the total only once it is actually filled in. */
const isComplete = (row: CostBreakdownRow) => row.description.trim().length > 0 && rowSubtotal(row) > 0;

export function breakdownTotal(rows: CostBreakdownRow[]): number {
  return rows.filter(isComplete).reduce((sum, r) => sum + rowSubtotal(r), 0);
}

export function hasCostBreakdown(rows: CostBreakdownRow[]): boolean {
  return rows.some(isComplete);
}

/** Plain-text rendering folded into the proposal's description, so reviewers see the basis without a separate column. */
export function formatBreakdownText(rows: CostBreakdownRow[]): string {
  const complete = rows.filter(isComplete);
  if (complete.length === 0) return "";
  const lines = complete.map(
    (r) => `- ${r.description.trim()} — ${r.quantity} × ${formatCurrency(Number(r.unitCost))} = ${formatCurrency(rowSubtotal(r))}`,
  );
  return ["Cost breakdown:", ...lines, `Estimated amount (computed): ${formatCurrency(breakdownTotal(complete))}`].join("\n");
}

export function CostBreakdownInput({
  rows,
  onChange,
}: {
  rows: CostBreakdownRow[];
  onChange: (rows: CostBreakdownRow[]) => void;
}) {
  const update = (id: string, patch: Partial<CostBreakdownRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const remove = (id: string) => onChange(rows.length > 1 ? rows.filter((r) => r.id !== id) : [emptyBreakdownRow()]);

  const total = breakdownTotal(rows);

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-12 items-center gap-2">
            <Input
              className="col-span-6"
              value={row.description}
              onChange={(e) => update(row.id, { description: e.target.value })}
              placeholder="e.g. Structural steel framing"
            />
            <Input
              className="col-span-2"
              type="number"
              min="0"
              value={row.quantity}
              onChange={(e) => update(row.id, { quantity: e.target.value })}
              placeholder="Qty"
            />
            <Input
              className="col-span-3"
              type="number"
              min="0"
              value={row.unitCost}
              onChange={(e) => update(row.id, { unitCost: e.target.value })}
              placeholder="Unit cost (₱)"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="col-span-1 h-9 w-9 text-muted-foreground"
              onClick={() => remove(row.id)}
              aria-label="Remove line item"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyBreakdownRow()])}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add line item
      </Button>
      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Estimated amount (computed from the breakdown above)</span>
        <span className="font-semibold">{total > 0 ? formatCurrency(total) : "—"}</span>
      </div>
    </div>
  );
}
