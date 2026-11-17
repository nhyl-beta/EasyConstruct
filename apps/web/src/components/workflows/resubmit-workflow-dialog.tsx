// apps/web/src/components/workflows/resubmit-workflow-dialog.tsx
//
// Bug sheet (16 Nov, Engineer / Approvals): clicking "Resubmit" on a
// revision-required stage sent the exact same request straight back — no way
// to see, let alone change, what the reviewer actually asked to be revised.
// This opens a modal first: the title and (for a budget-change request) its
// cost lines, pre-filled and editable, reviewed before anything is resent.
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format-currency";
import { LINE_ITEM_CATEGORIES, LINE_ITEM_UNITS } from "@/components/workflows/initiate-workflow-dialog";
import { WorkflowRepository } from "@/features/workflows/repositories/workflow.repository";
import type { Workflow, WorkflowLineItemCategory } from "@/features/workflows/types/workflow.types";

interface DraftLineItem {
  category: WorkflowLineItemCategory;
  description: string;
  currentAmount: string;
  requestedAmount: string;
  quantity: string;
  unit: string;
}

const toDraft = (items: Workflow["lineItems"]): DraftLineItem[] =>
  items.map((item) => ({
    category: (item.category as WorkflowLineItemCategory) ?? "other",
    description: item.description,
    currentAmount: item.currentAmount ?? "",
    requestedAmount: item.requestedAmount ?? "",
    quantity: item.quantity ?? "",
    unit: item.unit ?? "",
  }));

interface ResubmitWorkflowDialogProps {
  /** null closes the dialog. */
  workflow: Workflow | null;
  stageId: number | null;
  onOpenChange: (open: boolean) => void;
  onResubmitted: () => void;
}

export function ResubmitWorkflowDialog({
  workflow,
  stageId,
  onOpenChange,
  onResubmitted,
}: ResubmitWorkflowDialogProps) {
  const [title, setTitle] = useState("");
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const hasLineItems = (workflow?.lineItems.length ?? 0) > 0;

  // Reseeded every time a different workflow is opened, from what it was
  // last submitted with — the whole point is to see that before resending it.
  useEffect(() => {
    if (!workflow) return;
    setTitle(workflow.title);
    setLineItems(toDraft(workflow.lineItems));
    setFormError(null);
  }, [workflow]);

  const updateLineItem = (index: number, patch: Partial<DraftLineItem>) =>
    setLineItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const handleSubmit = async () => {
    if (!workflow || stageId === null) return;
    setFormError(null);

    if (!title.trim()) {
      setFormError("Title is required.");
      return;
    }
    const completed = lineItems.filter(
      (item) => item.description.trim() !== "" && item.requestedAmount.trim() !== "",
    );
    if (hasLineItems && completed.length === 0) {
      setFormError("Keep at least one cost change, with a description and a requested amount.");
      return;
    }

    setSubmitting(true);
    try {
      await WorkflowRepository.resubmitStage(workflow.id, stageId, {
        title: title.trim(),
        lineItems: hasLineItems
          ? completed.map((item) => ({
              category: item.category,
              description: item.description.trim(),
              currentAmount: Number(item.currentAmount || 0),
              requestedAmount: Number(item.requestedAmount),
              quantity: item.quantity.trim() ? Number(item.quantity) : undefined,
              unit: item.unit.trim() ? item.unit : undefined,
            }))
          : undefined,
      });
      onResubmitted();
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not resubmit.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={workflow !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review before resubmitting</DialogTitle>
          <DialogDescription>
            {workflow ? `${workflow.code} — sent back for revision. Make any changes, then resend it.` : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {workflow && (
          <div className="space-y-4 py-1">
            {formError && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive-strong">
                {formError}
              </p>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="rw-title">Title</Label>
              <Input
                id="rw-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={submitting}
              />
            </div>

            {hasLineItems && (
              <div className="grid gap-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Cost changes
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={submitting}
                    onClick={() =>
                      setLineItems((prev) => [
                        ...prev,
                        { category: "materials", description: "", currentAmount: "", requestedAmount: "", quantity: "", unit: "" },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Add change
                  </Button>
                </div>

                {lineItems.map((item, index) => {
                  const current = Number(item.currentAmount) || 0;
                  const requested = Number(item.requestedAmount) || 0;
                  const hasBothAmounts = item.currentAmount.trim() !== "" && item.requestedAmount.trim() !== "";
                  const delta = requested - current;
                  const deltaSign = delta > 0 ? "+" : delta < 0 ? "−" : "";
                  const deltaClass =
                    delta > 0 ? "text-destructive-strong" : delta < 0 ? "text-success-strong" : "text-muted-foreground";

                  return (
                    <div key={index} className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Change {index + 1}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive-strong hover:text-destructive-strong"
                          title="Remove this change"
                          disabled={submitting || lineItems.length === 1}
                          onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
                        <div className="grid gap-1">
                          <Label className="text-overline text-muted-foreground">Category</Label>
                          <Select
                            value={item.category}
                            onValueChange={(v) => updateLineItem(index, { category: v as WorkflowLineItemCategory })}
                            disabled={submitting}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LINE_ITEM_CATEGORIES.map((c) => (
                                <SelectItem key={c.value} value={c.value}>
                                  {c.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-overline text-muted-foreground">Description</Label>
                          <Input
                            className="h-9"
                            value={item.description}
                            onChange={(e) => updateLineItem(index, { description: e.target.value })}
                            disabled={submitting}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                        <div className="grid gap-1">
                          <Label className="text-overline text-muted-foreground">Current amount</Label>
                          <Input
                            className="h-9"
                            type="number"
                            min="0"
                            value={item.currentAmount}
                            onChange={(e) => updateLineItem(index, { currentAmount: e.target.value })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-overline text-muted-foreground">Requested amount</Label>
                          <Input
                            className="h-9"
                            type="number"
                            min="0"
                            value={item.requestedAmount}
                            onChange={(e) => updateLineItem(index, { requestedAmount: e.target.value })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="col-span-2 grid gap-1 md:col-span-1">
                          <Label className="text-overline text-muted-foreground">Change</Label>
                          <div className={`flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium ${deltaClass}`}>
                            {hasBothAmounts ? `${deltaSign}${formatCurrency(Math.abs(delta))}` : "—"}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 rounded-md border border-border/40 bg-background/60 p-2 md:grid-cols-[7rem_9rem]">
                        <div className="grid gap-1">
                          <Label className="text-overline text-muted-foreground">Quantity</Label>
                          <Input
                            className="h-9"
                            type="number"
                            min="0"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(index, { quantity: e.target.value })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-overline text-muted-foreground">Unit</Label>
                          <Select
                            value={item.unit}
                            onValueChange={(v) => updateLineItem(index, { unit: v })}
                            disabled={submitting}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {LINE_ITEM_UNITS.map((u) => (
                                <SelectItem key={u.value} value={u.value}>
                                  {u.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || !workflow}>
            {submitting ? "Resubmitting…" : "Resubmit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

ResubmitWorkflowDialog.displayName = "ResubmitWorkflowDialog";
