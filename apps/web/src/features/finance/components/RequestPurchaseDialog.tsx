import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReferencePicker } from "@/features/reference/components/ReferencePicker";
import { expenseCategoryForRequirement } from "@/config/expense-categories";
import { formatCurrency } from "@/lib/format-currency";
import { useExpenseCategories } from "../hooks/use-expense-categories";
import type { ActionResult, CreatePurchaseRequestInput, LineItem } from "../types/purchasing.types";
import { CategorySelect } from "./CategorySelect";

/** The slice of a requirement the dialog needs. */
export interface PurchasableRequirement {
  dbId: number;
  title: string;
  project: string;
  category: string;
}

interface Props {
  requirement: PurchasableRequirement | null;
  onClose: () => void;
  onSubmit: (input: CreatePurchaseRequestInput) => Promise<ActionResult<unknown>>;
  /** Shown under the title: who it goes to next. */
  routingHint: string;
}

const blankLine = (description = ""): LineItem => ({ description, qty: 1, unit: "lot", unitCost: 0 });

/** Raise a purchase request from an Approved requirement. The amount is computed on the server from the lines. */
export function RequestPurchaseDialog({ requirement, onClose, onSubmit, routingHint }: Props) {
  const [title, setTitle] = useState("");
  // What the person picked; until they pick, the category suggested from the requirement (against the live list).
  const [picked, setPicked] = useState<string | null>(null);
  const [lines, setLines] = useState<LineItem[]>([blankLine()]);
  const [neededBy, setNeededBy] = useState("");
  const [justification, setJustification] = useState("");
  const [vendor, setVendor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requirement) return;
    setTitle(requirement.title);
    setPicked(null);
    setLines([blankLine(requirement.title)]);
    setNeededBy("");
    setJustification("");
    setVendor("");
    setError(null);
  }, [requirement]);

  const { activeCategories } = useExpenseCategories();
  const suggested = useMemo(
    () => (requirement ? expenseCategoryForRequirement(requirement.category, activeCategories.map((c) => c.name)) : ""),
    [requirement, activeCategories],
  );
  const category = picked ?? suggested;

  const total = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const linesOk = lines.length > 0 && lines.every((l) => l.description.trim() && l.qty > 0 && l.unitCost >= 0);
  const canSubmit = !!requirement && title.trim().length >= 2 && !!category && linesOk && total > 0 && !busy;

  const patch = (i: number, change: Partial<LineItem>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...change } : l)));

  const submit = async () => {
    if (!requirement) return;
    setBusy(true);
    setError(null);
    const r = await onSubmit({
      requirementId: requirement.dbId,
      title: title.trim(),
      category,
      lineItems: lines.map((l) => ({ ...l, description: l.description.trim(), unit: l.unit.trim() || "lot" })),
      neededBy: neededBy || undefined,
      justification: justification.trim() || undefined,
      preferredVendor: vendor.trim() || undefined,
    });
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };

  return (
    <Dialog open={requirement !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request purchase</DialogTitle>
          <DialogDescription>
            For {requirement?.project}. {routingHint}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pr-title">Title</Label>
              <Input id="pr-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-cat">Category</Label>
              <CategorySelect id="pr-cat" value={category} onValueChange={setPicked} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-needed">Needed by</Label>
              <Input id="pr-needed" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Line items</legend>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-12 sm:col-span-5">
                  <Label className="sr-only" htmlFor={`pr-desc-${i}`}>Description</Label>
                  <Input id={`pr-desc-${i}`} placeholder="Description" value={l.description} onChange={(e) => patch(i, { description: e.target.value })} />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Label className="sr-only" htmlFor={`pr-qty-${i}`}>Quantity</Label>
                  <Input id={`pr-qty-${i}`} type="number" min={0} placeholder="Qty" value={l.qty} onChange={(e) => patch(i, { qty: Number(e.target.value) || 0 })} />
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <Label className="sr-only" htmlFor={`pr-unit-${i}`}>Unit</Label>
                  <Input id={`pr-unit-${i}`} placeholder="Unit" value={l.unit} onChange={(e) => patch(i, { unit: e.target.value })} />
                </div>
                <div className="col-span-4 sm:col-span-3">
                  <Label className="sr-only" htmlFor={`pr-cost-${i}`}>Unit cost</Label>
                  <Input id={`pr-cost-${i}`} type="number" min={0} placeholder="Unit cost" value={l.unitCost} onChange={(e) => patch(i, { unitCost: Number(e.target.value) || 0 })} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
                <Plus className="h-3.5 w-3.5" /> Add line
              </Button>
              <p className="text-sm font-semibold tabular-nums">Total {formatCurrency(total)}</p>
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pr-just">Justification</Label>
              <Textarea id="pr-just" rows={2} value={justification} onChange={(e) => setJustification(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pr-vendor">Preferred vendor (optional)</Label>
              <ReferencePicker kind="vendors" id="pr-vendor" value={vendor} onChange={(name) => setVendor(name)} placeholder="Select a vendor (optional)" />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive-strong">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? "Sending…" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
