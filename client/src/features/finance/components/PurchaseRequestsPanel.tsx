import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format-currency";
import type { usePurchaseRequests } from "../hooks/use-purchase-requests";
import type { useProcurement } from "../hooks/use-procurement";
import { PR_LABELS, shortDate } from "../lib/purchasing-labels";
import type { ActionResult, BudgetImpact, LineItem, PurchaseRequest, PurchaseRequestStatus } from "../types/purchasing.types";
import { DecisionDialog } from "./DecisionDialog";

export type Notice = { tone: "warn" | "error" | "info"; text: string } | null;

interface Props {
  requests: ReturnType<typeof usePurchaseRequests>;
  orders: ReturnType<typeof useProcurement>;
  /** Finance and Admin decide; nobody else is shown the buttons (the server refuses them too). */
  canDecide: boolean;
  onNotice: (n: Notice) => void;
}

const STATUS_FILTERS: ("all" | PurchaseRequestStatus)[] = ["all", "pending-finance", "pending-pm", "approved", "ordered", "rejected", "cancelled"];

const isOver = (impact: BudgetImpact | null | undefined, amount: number) => impact == null || amount > impact.remaining;

function BudgetImpactCard({ impact, amount }: { impact: BudgetImpact | null | undefined; amount: number }) {
  if (impact === undefined) return <Skeleton className="h-20 w-full" />;
  if (impact === null) {
    return (
      <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden />
        <span>There is no budget line for this project and category, so this amount would not count against any budget.</span>
      </div>
    );
  }
  const over = amount > impact.remaining;
  const cells: [string, number, boolean][] = [
    ["Planned", impact.planned, false],
    ["Committed", impact.committed, false],
    ["Actual", impact.actual, false],
    ["Remaining", impact.remaining, impact.remaining < 0],
  ];
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map(([label, value, bad]) => (
          <div key={label}>
            <dt className="text-overline uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className={`text-sm font-semibold tabular-nums ${bad ? "text-destructive-strong" : ""}`}>{formatCurrency(value)}</dd>
          </div>
        ))}
      </dl>
      <p className={`text-xs ${over ? "font-medium text-destructive-strong" : "text-muted-foreground"}`}>
        {over
          ? `Over budget: this request is ${formatCurrency(amount - impact.remaining)} more than what is left.`
          : `${formatCurrency(impact.remainingAfter)} would remain after this request.`}
      </p>
    </div>
  );
}

function LineItemsTable({ items }: { items: LineItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No line items recorded.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead className="text-right">Unit cost</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((l, i) => (
          <TableRow key={i}>
            <TableCell className="text-sm">{l.description}</TableCell>
            <TableCell className="text-right tabular-nums">{l.qty}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{l.unit}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(l.unitCost)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(l.qty * l.unitCost)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Finance turns an approved request into an order: vendor, ETA, and (optionally) fewer or cheaper lines. */
function CreateOrderDialog({
  request,
  onClose,
  onCreate,
}: {
  request: PurchaseRequest | null;
  onClose: () => void;
  onCreate: (input: { purchaseRequestId: string; vendor: string; etaDate?: string; lineItems: LineItem[] }) => Promise<ActionResult<unknown>>;
}) {
  const [vendor, setVendor] = useState("");
  const [eta, setEta] = useState("");
  const [lines, setLines] = useState<LineItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (request) {
      setVendor(request.preferredVendor ?? "");
      setEta(request.neededBy ?? "");
      setLines(request.lineItems.map((l) => ({ ...l })));
      setError(null);
    }
  }, [request]);

  const total = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const tooMuch = request ? total > request.amount + 0.001 : false;
  const canSubmit = !!request && vendor.trim().length > 0 && total > 0 && !tooMuch && !busy;

  const patch = (i: number, key: "qty" | "unitCost", value: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [key]: Number(value) || 0 } : l)));

  const submit = async () => {
    if (!request) return;
    setBusy(true);
    setError(null);
    const r = await onCreate({ purchaseRequestId: request.id, vendor: vendor.trim(), etaDate: eta || undefined, lineItems: lines });
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create order for {request?.id}</DialogTitle>
          <DialogDescription>
            An order can be for less than the request (the difference goes back to the budget), never for more.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="po-vendor">Vendor</Label>
              <Input id="po-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="ABC Steel Supply" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-eta">Expected delivery</Label>
              <Input id="po-eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-24 text-right">Qty</TableHead>
                  <TableHead className="w-32 text-right">Unit cost</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">
                      {l.description} <span className="text-xs text-muted-foreground">({l.unit})</span>
                    </TableCell>
                    <TableCell>
                      <Input aria-label={`Quantity of ${l.description}`} type="number" min={0} className="h-8 text-right" value={l.qty} onChange={(e) => patch(i, "qty", e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input aria-label={`Unit cost of ${l.description}`} type="number" min={0} className="h-8 text-right" value={l.unitCost} onChange={(e) => patch(i, "unitCost", e.target.value)} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(l.qty * l.unitCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className={`text-sm ${tooMuch ? "font-medium text-destructive-strong" : "text-muted-foreground"}`}>
            Order total {formatCurrency(total)} of {request ? formatCurrency(request.amount) : ""} requested
            {tooMuch ? ". It is more than the request; raise a new request for the difference." : "."}
          </p>
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
            {busy ? "Creating…" : "Create order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PurchaseRequestsPanel({ requests, orders, canDecide, onNotice }: Props) {
  const [filter, setFilter] = useState<"all" | PurchaseRequestStatus>("pending-finance");
  const [selected, setSelected] = useState<PurchaseRequest | null>(null);
  const [detail, setDetail] = useState<PurchaseRequest | null>(null);
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);
  const [ordering, setOrdering] = useState<PurchaseRequest | null>(null);

  const rows = useMemo(
    () => requests.requests.filter((r) => filter === "all" || r.status === filter),
    [requests.requests, filter],
  );
  const pg = usePagination(rows, 8, filter);

  // The list has no budget impact; the detail does. Loaded when a row is opened.
  const { detail: loadDetail } = requests;
  useEffect(() => {
    setDetail(null);
    if (!selected) return;
    let active = true;
    loadDetail(selected.id)
      .then((d) => active && setDetail(d))
      .catch(() => active && setDetail({ ...selected, budgetImpact: undefined }));
    return () => {
      active = false;
    };
  }, [selected, loadDetail]);

  const current = selected ? (requests.requests.find((r) => r.id === selected.id) ?? selected) : null;
  const impact = detail?.budgetImpact;
  const needsNote = current ? isOver(impact, current.amount) && impact !== undefined : false;

  const report = (r: ActionResult<unknown>): string | null => {
    if (!r.ok) {
      onNotice({ tone: "error", text: r.error ?? "Could not update the request" });
      return r.error;
    }
    onNotice(r.warning ? { tone: "warn", text: r.warning } : null);
    return null;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="pr-filter" className="text-xs text-muted-foreground">
          Show
        </Label>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger id="pr-filter" className="h-8 w-48 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All requests" : PR_LABELS[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {requests.error && (
        <p role="alert" className="text-sm text-destructive-strong">
          Failed to load purchase requests: {requests.error}
        </p>
      )}

      {requests.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {filter === "pending-finance" ? "Nothing is waiting on Finance." : "No purchase requests match this filter."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Request</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Needed by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pg.pageItems.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.id}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {r.title}
                    {r.overBudget && (
                      <Badge variant="outline" className="ml-2 rounded-full border-warning/40 bg-warning/10 text-overline text-warning-strong">
                        Over budget
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.project}</TableCell>
                  <TableCell className="text-xs">{r.requestedBy}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatCurrency(r.amount)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{shortDate(r.neededBy)}</TableCell>
                  <TableCell>
                    <StatusBadge status={PR_LABELS[r.status].label} tone={PR_LABELS[r.status].tone} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setSelected(r)}>
                        {canDecide && r.status === "pending-finance" ? "Review" : "Details"}
                      </Button>
                      {canDecide && r.status === "approved" && (
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setOrdering(r)}>
                          Create order
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="pt-2">
            <DataTablePagination {...pg} />
          </div>
        </div>
      )}

      <Sheet open={current !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {current && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {current.id} · {current.title}
                </SheetTitle>
                <SheetDescription>
                  {current.project} · {current.category} · raised by {current.requestedBy}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="flex items-center gap-2">
                  <StatusBadge status={PR_LABELS[current.status].label} tone={PR_LABELS[current.status].tone} />
                  <span className="text-lg font-semibold tabular-nums">{formatCurrency(current.amount)}</span>
                </div>
                {(current.status === "pending-finance" || current.status === "pending-pm" || current.status === "approved") && (
                  <BudgetImpactCard impact={impact} amount={current.amount} />
                )}
                <LineItemsTable items={current.lineItems} />
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Needed by</dt>
                    <dd>{shortDate(current.neededBy)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Preferred vendor</dt>
                    <dd>{current.preferredVendor ?? "—"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Justification</dt>
                    <dd>{current.justification ?? "—"}</dd>
                  </div>
                  {current.endorsedBy && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Endorsed by</dt>
                      <dd>
                        {current.endorsedBy} · {shortDate(current.endorsedAt)}
                      </dd>
                    </div>
                  )}
                  {current.decidedBy && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Decided by</dt>
                      <dd>
                        {current.decidedBy} · {shortDate(current.decidedAt)}
                      </dd>
                    </div>
                  )}
                  {current.decisionNote && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Decision note</dt>
                      <dd>{current.decisionNote}</dd>
                    </div>
                  )}
                </dl>
                {canDecide && current.status === "pending-finance" && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button disabled={impact === undefined} onClick={() => setDeciding("approve")}>
                      Approve
                    </Button>
                    <Button variant="outline" className="text-destructive-strong" onClick={() => setDeciding("reject")}>
                      Reject
                    </Button>
                  </div>
                )}
                {canDecide && current.status === "approved" && (
                  <Button onClick={() => setOrdering(current)}>Create order</Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {current && (
        <DecisionDialog
          open={deciding !== null}
          onOpenChange={(open) => !open && setDeciding(null)}
          title={deciding === "approve" ? `Approve ${current.id}?` : `Reject ${current.id}?`}
          description={
            deciding === "approve"
              ? `${formatCurrency(current.amount)} will be committed on the ${current.project} ${current.category} budget until it is paid.`
              : "The requester is told why."
          }
          noteLabel={deciding === "approve" ? "Decision note" : "Reason"}
          noteRequired={deciding === "reject" || (deciding === "approve" && needsNote)}
          confirmLabel={deciding === "approve" ? "Approve request" : "Reject request"}
          destructive={deciding === "reject"}
          onSubmit={async (note) =>
            report(deciding === "approve" ? await requests.approve(current.id, note || undefined) : await requests.reject(current.id, note))
          }
        >
          {deciding === "approve" && needsNote && (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden />
              {impact === null
                ? "There is no matching budget line. A note is needed to approve; the request is flagged over budget."
                : "This is more than the budget has left. A note is needed to approve; the request is flagged over budget."}
            </p>
          )}
        </DecisionDialog>
      )}

      <CreateOrderDialog
        request={ordering}
        onClose={() => setOrdering(null)}
        onCreate={async (input) => {
          const r = await orders.create(input);
          if (r.ok) {
            await requests.reload();
            onNotice({ tone: "info", text: `Order ${r.data?.id ?? ""} created. It now appears under Procurement.` });
            setSelected(null);
          }
          return r;
        }}
      />
    </div>
  );
}
