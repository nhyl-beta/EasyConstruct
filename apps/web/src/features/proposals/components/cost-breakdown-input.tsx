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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format-currency";

// Standard construction units of measure — fixed list, not free text, so a
// rate stays comparable (₱/m³ means something; a made-up unit doesn't).
export const BREAKDOWN_UNITS = ["m", "m²", "m³", "kg", "ton", "bag", "pcs", "set", "lot", "l.s."] as const;

export interface CostBreakdownRow {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
}

export const emptyBreakdownRow = (): CostBreakdownRow => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: "",
  unit: "",
  unitCost: "",
});

function rowSubtotal(row: CostBreakdownRow): number {
  const qty = Number(row.quantity);
  const cost = Number(row.unitCost);
  if (!Number.isFinite(qty) || !Number.isFinite(cost) || qty <= 0 || cost <= 0) return 0;
  return qty * cost;
}

/** A row counts toward the total only once it is actually filled in. */
const isComplete = (row: CostBreakdownRow) => row.description.trim().length > 0 && row.unit.trim().length > 0 && rowSubtotal(row) > 0;

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
    (r) => `- ${r.description.trim()} — ${r.quantity} ${r.unit} × ${formatCurrency(Number(r.unitCost))}/${r.unit} = ${formatCurrency(rowSubtotal(r))}`,
  );
  return ["Cost breakdown:", ...lines, `Estimated amount (computed): ${formatCurrency(breakdownTotal(complete))}`].join("\n");
}

/** The breakdown rows in the shape the API compares against the EstimationPro.ai reference catalog (validation.ts check 5). */
export function toBreakdownPayload(rows: CostBreakdownRow[]): { description: string; quantity: number; unit: string; unitCost: number }[] {
  return rows.filter(isComplete).map((r) => ({
    description: r.description.trim(),
    quantity: Number(r.quantity),
    unit: r.unit,
    unitCost: Number(r.unitCost),
  }));
}

interface BreakdownTemplateItem {
  description: string;
  unit: (typeof BREAKDOWN_UNITS)[number];
}

// A handful of standard trade line items to start a breakdown from. Quantity and rate are
// always left blank — a template is a starting checklist of what a BOQ line for this trade
// usually covers, never a stand-in number for the architect's own figures.
export const BOQ_TEMPLATES: Record<string, BreakdownTemplateItem[]> = {
  Structural: [
    { description: "Ready-mix concrete, Class A", unit: "m³" },
    { description: "Reinforcing steel bars", unit: "kg" },
    { description: "Formworks", unit: "m²" },
    { description: "Structural steel framing", unit: "kg" },
  ],
  Electrical: [
    { description: "Wiring and conduits", unit: "lot" },
    { description: "Panel boards and breakers", unit: "set" },
    { description: "Lighting fixtures", unit: "pcs" },
  ],
  Plumbing: [
    { description: "PVC piping and fittings", unit: "lot" },
    { description: "Plumbing fixtures (water closets, lavatories)", unit: "pcs" },
    { description: "Water tank and pump system", unit: "set" },
  ],
  "Architectural / Finishing": [
    { description: "Floor tiles", unit: "m²" },
    { description: "Paint and finishing works", unit: "m²" },
    { description: "Doors and windows", unit: "pcs" },
  ],
};

const isBlankRow = (row: CostBreakdownRow) =>
  !row.description.trim() && !row.quantity.trim() && !row.unit.trim() && !row.unitCost.trim();

/** Inserts a template's starter line items. A single still-blank starter row is dropped first
 * so picking a template doesn't leave a stray empty line above it; real rows are kept and
 * added to. */
export function applyTemplate(rows: CostBreakdownRow[], templateName: string): CostBreakdownRow[] {
  const template = BOQ_TEMPLATES[templateName];
  if (!template) return rows;
  const kept = rows.length === 1 && isBlankRow(rows[0]!) ? [] : rows;
  const added = template.map((item) => ({ ...emptyBreakdownRow(), description: item.description, unit: item.unit }));
  return [...kept, ...added];
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
              className="col-span-5"
              value={row.description}
              onChange={(e) => update(row.id, { description: e.target.value })}
              placeholder="e.g. Ready-mix concrete, Class A"
            />
            <Input
              className="col-span-2"
              type="number"
              min="0"
              value={row.quantity}
              onChange={(e) => update(row.id, { quantity: e.target.value })}
              placeholder="Qty"
            />
            <Select value={row.unit} onValueChange={(v) => update(row.id, { unit: v })}>
              <SelectTrigger className="col-span-2">
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                {BREAKDOWN_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="col-span-2"
              type="number"
              min="0"
              value={row.unitCost}
              onChange={(e) => update(row.id, { unitCost: e.target.value })}
              placeholder="Rate (₱)"
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
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyBreakdownRow()])}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add line item
        </Button>
        <Select onValueChange={(templateName) => onChange(applyTemplate(rows, templateName))}>
          <SelectTrigger className="h-8 w-auto gap-1 border-dashed text-xs">
            <SelectValue placeholder="Use a template…" />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(BOQ_TEMPLATES).map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Estimated amount (computed from the breakdown above)</span>
        <span className="font-semibold">{total > 0 ? formatCurrency(total) : "—"}</span>
      </div>
    </div>
  );
}
