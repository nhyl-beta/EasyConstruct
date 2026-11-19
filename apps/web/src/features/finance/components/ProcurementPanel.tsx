import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { openFileUrl } from "@/lib/file-url";
import { formatCurrency } from "@/lib/format-currency";
import type { useProcurement } from "../hooks/use-procurement";
import { ORDER_LABELS, shortDate } from "../lib/purchasing-labels";
import { uploadReceipt } from "../lib/upload-receipts";
import { ORDER_STATUSES, type ActionResult, type OrderStatus, type ProcurementOrder } from "../types/purchasing.types";
import { DecisionDialog } from "./DecisionDialog";
import type { Notice } from "./PurchaseRequestsPanel";

const STATUS_FILTERS = ["all", ...ORDER_STATUSES] as const;

interface Props {
  procurement: ReturnType<typeof useProcurement>;
  /** Finance and Admin run orders; nobody else is shown the buttons (the server refuses them too). */
  canAct: boolean;
  onNotice: (n: Notice) => void;
  /** Open the Tracking tab on the expense a payment created. */
  onOpenExpense: (expenseId: string) => void;
}

type Dialog = { kind: "ship" | "pay" | "cancel" | "resume" | "void"; order: ProcurementOrder } | null;

/** The payment dialog: invoice number, amount, optional invoice file, and a note when the amount differs. */
function PayDialog({
  order,
  onClose,
  onPay,
}: {
  order: ProcurementOrder | null;
  onClose: () => void;
  onPay: (id: string, input: { invoiceNumber: string; invoiceAmount: number; invoiceUrl?: string; varianceNote?: string }) => Promise<string | null>;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [lastOrder, setLastOrder] = useState<string | null>(null);

  if (order && order.id !== lastOrder) {
    setLastOrder(order.id);
    setInvoiceNumber("");
    setAmount(String(order.amount));
    setFile(null);
  }

  const invoiceAmount = Number(amount);
  const differs = !!order && Number.isFinite(invoiceAmount) && invoiceAmount !== order.amount;
  const variance = order ? invoiceAmount - order.amount : 0;
  const valid = invoiceNumber.trim().length > 0 && invoiceAmount > 0;

  return (
    <DecisionDialog
      open={order !== null}
      onOpenChange={(open) => !open && onClose()}
      title={`Record payment for ${order?.id ?? ""}`}
      description="Paying creates one approved expense, books it against the budget and releases the commitment. It cannot be undone."
      noteLabel="Variance note"
      noteRequired={differs}
      confirmLabel="Record payment"
      disabled={!valid}
      onSubmit={async (note) => {
        if (!order) return null;
        let invoiceUrl: string | undefined;
        if (file) {
          try {
            invoiceUrl = (await uploadReceipt(file)).url;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not upload the invoice";
          }
        }
        return onPay(order.id, { invoiceNumber: invoiceNumber.trim(), invoiceAmount, invoiceUrl, varianceNote: note || undefined });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="inv-no">Invoice number</Label>
          <Input id="inv-no" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-amt">Invoice amount</Label>
          <Input id="inv-amt" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inv-file">Invoice file (optional)</Label>
        <Input id="inv-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      {order && (
        <p className={`text-xs ${differs ? "font-medium text-warning-strong" : "text-muted-foreground"}`}>
          Ordered for {formatCurrency(order.amount)}.{" "}
          {differs ? `The invoice is ${formatCurrency(Math.abs(variance))} ${variance > 0 ? "higher" : "lower"}; a note is required.` : "The invoice matches."}
        </p>
      )}
    </DecisionDialog>
  );
}

export function ProcurementPanel({ procurement, canAct, onNotice, onOpenExpense }: Props) {
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return procurement.orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!q) return true;
      return o.id.toLowerCase().includes(q) || o.vendor.toLowerCase().includes(q) || o.project.toLowerCase().includes(q) || (o.purchaseRequestId ?? "").toLowerCase().includes(q);
    });
  }, [procurement.orders, statusFilter, query]);
  const pg = usePagination(rows, 8, statusFilter + query);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [eta, setEta] = useState("");

  const report = (r: ActionResult<unknown>, done?: string): string | null => {
    if (!r.ok) {
      onNotice({ tone: "error", text: r.error ?? "Could not update the order" });
      return r.error;
    }
    onNotice(done ? { tone: "info", text: done } : null);
    return null;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="po-status-filter" className="text-xs text-muted-foreground">
          Show
        </Label>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger id="po-status-filter" className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All orders" : ORDER_LABELS[s as OrderStatus].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search order, request, vendor, project…"
          className="h-8 w-64 text-xs"
        />
      </div>

      {procurement.error && (
        <p role="alert" className="text-sm text-destructive-strong">
          Failed to load orders: {procurement.error}
        </p>
      )}
      {procurement.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : procurement.orders.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          No orders yet. Approve a purchase request, then create its order.
        </p>
      ) : rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          No orders match your filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Request</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received by</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pg.pageItems.map((o) => {
                const label = ORDER_LABELS[o.status];
                const variance = o.invoiceAmount != null ? o.invoiceAmount - o.amount : 0;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.id}</TableCell>
                    <TableCell className="font-mono text-xs">{o.purchaseRequestId ?? "—"}</TableCell>
                    <TableCell className="text-sm font-medium">{o.vendor}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{o.project}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatCurrency(o.amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{shortDate(o.etaDate)}</TableCell>
                    <TableCell>
                      <StatusBadge status={label.label} tone={label.tone} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {o.receivedBy ?? "—"}
                      {o.deliveredAt && <div className="text-muted-foreground">{shortDate(o.deliveredAt)}</div>}
                      {o.deliveryReceiptUrl && (
                        <button
                          type="button"
                          className="text-primary-strong underline-offset-2 hover:underline"
                          onClick={() => void openFileUrl(o.deliveryReceiptUrl!).catch((e: Error) => onNotice({ tone: "error", text: e.message }))}
                        >
                          Receipt
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {o.invoiceNumber ? (
                        <>
                          <div>{o.invoiceNumber}</div>
                          <div className="tabular-nums">{o.invoiceAmount != null ? formatCurrency(o.invoiceAmount) : ""}</div>
                          {variance !== 0 && (
                            <div className="text-warning-strong" title={o.varianceNote ?? undefined}>
                              Variance {variance > 0 ? "+" : "−"}
                              {formatCurrency(Math.abs(variance))}
                            </div>
                          )}
                          {o.expenseId && (
                            <button type="button" className="font-mono text-primary-strong underline-offset-2 hover:underline" onClick={() => onOpenExpense(o.expenseId!)}>
                              {o.expenseId}
                            </button>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canAct && (
                        <div className="flex justify-end gap-1.5">
                          {o.status === "ordered" && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setEta(o.etaDate ?? ""); setDialog({ kind: "ship", order: o }); }}>
                              Mark in transit
                            </Button>
                          )}
                          {o.status === "delivered" && (
                            <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setDialog({ kind: "pay", order: o })}>
                              Record payment
                            </Button>
                          )}
                          {o.status === "cancelled" && (
                            <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setDialog({ kind: "resume", order: o })}>
                              Resume
                            </Button>
                          )}
                          {o.status === "cancelled" && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-destructive/40 text-destructive-strong" onClick={() => setDialog({ kind: "void", order: o })}>
                              Cancel order
                            </Button>
                          )}
                          {(o.status === "ordered" || o.status === "in-transit") && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-destructive/40 text-destructive-strong" onClick={() => setDialog({ kind: "cancel", order: o })}>
                              On hold
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="pt-2">
            <DataTablePagination {...pg} />
          </div>
        </div>
      )}

      <DecisionDialog
        open={dialog?.kind === "ship"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Mark ${dialog?.order.id ?? ""} in transit`}
        description="Optionally update the expected delivery date."
        confirmLabel="Mark in transit"
        hideNote
        onSubmit={async () => (dialog ? report(await procurement.ship(dialog.order.id, eta || undefined)) : null)}
      >
        <div className="space-y-1.5">
          <Label htmlFor="ship-eta">Expected delivery</Label>
          <Input id="ship-eta" type="date" className="max-w-48" value={eta} onChange={(e) => setEta(e.target.value)} />
        </div>
      </DecisionDialog>

      <DecisionDialog
        open={dialog?.kind === "cancel"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Put ${dialog?.order.id ?? ""} on hold?`}
        description="The request goes back to Approved and holds its full amount on the budget again."
        confirmLabel="Put on hold"
        destructive
        hideNote
        onSubmit={async () => (dialog ? report(await procurement.cancel(dialog.order.id), "Order on hold. Its request is Approved again.") : null)}
      />

      <DecisionDialog
        open={dialog?.kind === "void"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Cancel ${dialog?.order.id ?? ""}?`}
        description="The order is cancelled for good and its request is cancelled too. The money it held goes back to the budget. This cannot be undone."
        confirmLabel="Cancel order"
        destructive
        hideNote
        onSubmit={async () => (dialog ? report(await procurement.voidOrder(dialog.order.id), "Order cancelled. Its request is cancelled too.") : null)}
      />

      <DecisionDialog
        open={dialog?.kind === "resume"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Resume ${dialog?.order.id ?? ""}?`}
        description="The order goes back to Ordered and its request is taken off Approved again. It must be marked in transit again."
        confirmLabel="Resume order"
        hideNote
        onSubmit={async () => (dialog ? report(await procurement.resume(dialog.order.id), "Order resumed.") : null)}
      />

      <PayDialog
        order={dialog?.kind === "pay" ? dialog.order : null}
        onClose={() => setDialog(null)}
        onPay={async (id, input) => {
          const r = await procurement.pay(id, input);
          return report(r, r.ok ? "Paid. One approved expense was created and booked against the budget." : undefined);
        }}
      />
    </div>
  );
}
