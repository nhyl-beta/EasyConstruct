// apps/web/src/components/workflows/initiate-workflow-dialog.tsx
//
// One dialog behind every role-specific "start this workflow" action:
//
//   Architect → Design Proposal Approval   (design proposal submission)
//   Architect → Public works compliance    (architect review step)
//   Engineer  → Budget Change Request      (justification + cost line items)
//   HR        → Subcontractor onboarding   (subcontracting plan + document)
//
// They are the same operation with different fields switched on, so this is
// parameterised rather than copied four times. The shared workflow
// abstraction it builds on already existed — workflow_templates /
// workflows / workflow_stages — so none of these introduce a new workflow
// engine; they resolve an existing template by name and start it.
import { useEffect, useState } from "react";
import { Paperclip, Plus, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { ProjectPicker } from "@/components/shared/project-picker";
import { FEATURES } from "@/config/features";
import { formatCurrency } from "@/lib/format-currency";
import {
  useWorkflowInitiation,
  type InitiateWorkflowInput,
} from "@/features/workflows/hooks/useWorkflows";
import type {
  Workflow,
  WorkflowLineItemCategory,
} from "@/features/workflows/types/workflow.types";

const LINE_ITEM_CATEGORIES: { value: WorkflowLineItemCategory; label: string }[] = [
  { value: "materials", label: "Materials" },
  { value: "labor", label: "Labour" },
  { value: "equipment", label: "Equipment" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "other", label: "Other costs" },
];

interface DraftLineItem {
  category: WorkflowLineItemCategory;
  description: string;
  currentAmount: string;
  requestedAmount: string;
  quantity: string;
  unit: string;
}

const emptyLineItem = (): DraftLineItem => ({
  category: "materials",
  description: "",
  currentAmount: "",
  requestedAmount: "",
  quantity: "",
  unit: "",
});

// ai-signals C6: only units units.ts (server) actually knows how to
// convert between — anything else is accepted as free-form text elsewhere,
// but a comparison against the cost catalog needs one of these to have any
// chance of matching a reference item's unit.
const LINE_ITEM_UNITS = [
  { value: "sqm", label: "sq m" },
  { value: "sqft", label: "sq ft" },
  { value: "m", label: "m" },
  { value: "lf", label: "linear ft" },
  { value: "m3", label: "cu m" },
  { value: "cy", label: "cu yd" },
  { value: "kg", label: "kg" },
  { value: "lb", label: "lb" },
  { value: "each", label: "each" },
  { value: "bag", label: "bag" },
];

export interface InitiateWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Exact workflow_templates.name to start — resolved by name, not id. */
  templateName: string;
  /** Dialog heading, e.g. "Submit design proposal". */
  title: string;
  description: string;
  /** Prefilled into workflows.type so the queue rows read sensibly. */
  workflowType?: string;
  titleLabel?: string;
  titlePlaceholder?: string;
  /** A free-text submission filed as a workflow note (kind: "note"). */
  noteLabel?: string;
  notePlaceholder?: string;
  noteRequired?: boolean;
  /** Attachment label used for the note, e.g. "Justification". */
  noteAttachmentLabel?: string;
  /** Shows a file input; the file is attached after the workflow exists. */
  showDocumentUpload?: boolean;
  documentLabel?: string;
  /** Shows the materials / labour / other-cost line-item editor. */
  showLineItems?: boolean;
  /** Shows a headline amount field (workflows.amount). */
  showAmount?: boolean;
  amountLabel?: string;
  submitLabel?: string;
  /** Prefill when the caller already knows the project (e.g. a proposal). */
  defaultProjectCode?: string;
  onCreated?: (workflow: Workflow) => void;
}

export function InitiateWorkflowDialog({
  open,
  onOpenChange,
  templateName,
  title,
  description,
  workflowType,
  titleLabel = "Title",
  titlePlaceholder,
  noteLabel,
  notePlaceholder,
  noteRequired = false,
  noteAttachmentLabel = "Submission note",
  showDocumentUpload = false,
  documentLabel = "Supporting document",
  showLineItems = false,
  showAmount = false,
  amountLabel = "Amount",
  submitLabel = "Start workflow",
  defaultProjectCode,
  onCreated,
}: InitiateWorkflowDialogProps) {
  const { template, loading, submitting, error, initiate } =
    useWorkflowInitiation(templateName);

  const [workflowTitle, setWorkflowTitle] = useState("");
  const [projectCode, setProjectCode] = useState(defaultProjectCode ?? "");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([emptyLineItem()]);
  const [formError, setFormError] = useState<string | null>(null);

  // Reseeded on every open — the dialog is reused for different submissions,
  // so leaving the previous one's values in place would be a silent misfile.
  useEffect(() => {
    if (!open) return;
    setWorkflowTitle("");
    setProjectCode(defaultProjectCode ?? "");
    setNote("");
    setAmount("");
    setFile(null);
    setLineItems([emptyLineItem()]);
    setFormError(null);
  }, [open, defaultProjectCode]);

  const updateLineItem = (index: number, patch: Partial<DraftLineItem>) =>
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );

  // Only lines with both a description and a requested amount are sent — a
  // half-typed row is dropped rather than persisted as a ₱0 change.
  const completedLineItems = lineItems.filter(
    (item) => item.description.trim() !== "" && item.requestedAmount.trim() !== "",
  );

  const handleSubmit = async () => {
    setFormError(null);

    if (!workflowTitle.trim()) {
      setFormError(`${titleLabel} is required.`);
      return;
    }
    if (!projectCode) {
      setFormError("Select the project this relates to.");
      return;
    }
    if (noteRequired && !note.trim()) {
      setFormError(`${noteLabel ?? "A written submission"} is required.`);
      return;
    }
    if (showLineItems && completedLineItems.length === 0) {
      setFormError("Add at least one cost change, with a description and a requested amount.");
      return;
    }

    const input: InitiateWorkflowInput = {
      title: workflowTitle.trim(),
      projectCode,
      type: workflowType,
      file,
    };

    if (note.trim()) {
      input.attachments = [
        { kind: "note", label: noteAttachmentLabel, content: note.trim() },
      ];
    }

    if (showLineItems) {
      input.lineItems = completedLineItems.map((item) => ({
        category: item.category,
        description: item.description.trim(),
        currentAmount: Number(item.currentAmount || 0),
        requestedAmount: Number(item.requestedAmount),
        quantity: item.quantity.trim() ? Number(item.quantity) : undefined,
        unit: item.unit.trim() ? item.unit : undefined,
      }));
      // The headline amount is the net movement the line items add up to, so
      // the queue's amount column and the line items can never disagree.
      input.amount = input.lineItems.reduce(
        (sum, item) => sum + (item.requestedAmount - (item.currentAmount ?? 0)),
        0,
      );
    } else if (showAmount && amount.trim()) {
      input.amount = Number(amount);
    }

    const created = await initiate(input);
    if (!created) return;

    onCreated?.(created);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {(formError || error) && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive-strong"
            >
              {formError ?? error?.message}
            </p>
          )}

          {template && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Starts the <span className="font-medium text-foreground">{template.name}</span>{" "}
              workflow:{" "}
              {template.defaultStages.map((stage) => stage.roleLabel).join(" → ")}
            </p>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="iw-title">{titleLabel}</Label>
            <Input
              id="iw-title"
              value={workflowTitle}
              onChange={(e) => setWorkflowTitle(e.target.value)}
              placeholder={titlePlaceholder}
              disabled={submitting}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Project</Label>
            <ProjectPicker
              value={projectCode}
              onChange={setProjectCode}
              className="w-full"
            />
          </div>

          {showAmount && !showLineItems && (
            <div className="grid gap-1.5">
              <Label htmlFor="iw-amount">{amountLabel}</Label>
              <Input
                id="iw-amount"
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={submitting}
              />
            </div>
          )}

          {noteLabel && (
            <div className="grid gap-1.5">
              <Label htmlFor="iw-note">
                {noteLabel}
                {noteRequired && <span className="text-destructive-strong"> *</span>}
              </Label>
              <Textarea
                id="iw-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={notePlaceholder}
                className="min-h-28"
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                Filed against your stage and readable by every later approver.
              </p>
            </div>
          )}

          {showLineItems && (
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
                  onClick={() => setLineItems((prev) => [...prev, emptyLineItem()])}
                >
                  <Plus className="h-3.5 w-3.5" /> Add change
                </Button>
              </div>

              {/* B4: was unlabeled stacked inputs (placeholder text only,
                  no visible current→requested delta, no currency symbol,
                  quantity/unit/AI-hint reading as a disconnected second
                  row) — relabeled and grouped into one card per line item,
                  with a live computed change shown as the user types.
                  Data shape/validation below (DraftLineItem, submit,
                  completedLineItems) is unchanged. */}
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
                      <span className="text-xs font-medium text-muted-foreground">
                        Change {index + 1}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive-strong hover:text-destructive-strong"
                        title="Remove this change"
                        disabled={submitting || lineItems.length === 1}
                        onClick={() =>
                          setLineItems((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
                      <div className="grid gap-1">
                        <Label className="text-overline text-muted-foreground">Category</Label>
                        <Select
                          value={item.category}
                          onValueChange={(v) =>
                            updateLineItem(index, { category: v as WorkflowLineItemCategory })
                          }
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
                          placeholder="What is changing"
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
                          placeholder="0.00"
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
                          placeholder="0.00"
                          disabled={submitting}
                        />
                      </div>
                      <div className="col-span-2 grid gap-1 md:col-span-1">
                        <Label className="text-overline text-muted-foreground">Change</Label>
                        <div
                          className={`flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium ${deltaClass}`}
                        >
                          {hasBothAmounts ? `${deltaSign}${formatCurrency(Math.abs(delta))}` : "—"}
                        </div>
                      </div>
                    </div>

                    {/* Quantity/unit/AI-hint grouped with this line item —
                        was reading as a disconnected second row below. */}
                    <div className="grid grid-cols-2 gap-2 rounded-md border border-border/40 bg-background/60 p-2 md:grid-cols-[7rem_9rem_1fr]">
                      <div className="grid gap-1">
                        <Label className="text-overline text-muted-foreground">Quantity</Label>
                        <Input
                          className="h-9"
                          type="number"
                          min="0"
                          step="any"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(index, { quantity: e.target.value })}
                          placeholder="e.g. 500"
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
                      {FEATURES.ai && (
                        <p className="col-span-2 self-center text-xs text-muted-foreground md:col-span-1">
                          Add quantity and unit to compare against market cost.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showDocumentUpload && (
            <div className="grid gap-1.5">
              <Label htmlFor="iw-file">{documentLabel}</Label>
              <Input
                id="iw-file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg"
                disabled={submitting}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                {file
                  ? file.name
                  : "PDF, Word, Excel, PowerPoint, PNG or JPG — up to 10MB."}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loading || !template}>
            {submitting ? "Starting…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

InitiateWorkflowDialog.displayName = "InitiateWorkflowDialog";
