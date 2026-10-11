import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useMemo, useState } from "react";
import { Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { openFileUrl } from "@/lib/file-url";
import { formatCurrency } from "@/lib/format-currency";
import type { useReimbursements } from "../hooks/use-reimbursements";
import { CLAIM_LABELS, shortDate } from "../lib/purchasing-labels";
import type { ActionResult, ClaimStatus, ReimbursementClaim } from "../types/purchasing.types";
import { DecisionDialog } from "./DecisionDialog";
import type { Notice } from "./PurchaseRequestsPanel";

interface Props {
  claims: ReturnType<typeof useReimbursements>;
  /** Finance and Admin decide and pay; nobody else is shown the buttons (the server refuses them too). */
  canAct: boolean;
  onNotice: (n: Notice) => void;
  onOpenExpense: (expenseId: string) => void;
}

type Dialog = { kind: "approve" | "reject" | "pay"; claim: ReimbursementClaim } | null;

const FILTERS: ("all" | ClaimStatus)[] = ["all", "pending-finance", "approved", "pending-pm", "paid", "rejected", "cancelled"];

export function ReimbursementsPanel({ claims, canAct, onNotice, onOpenExpense }: Props) {
  const [filter, setFilter] = useState<"all" | ClaimStatus>("pending-finance");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reference, setReference] = useState("");

  const rows = useMemo(() => claims.claims.filter((c) => filter === "all" || c.status === filter), [claims.claims, filter]);
  const pg = usePagination(rows, 8, filter);

  const report = (r: ActionResult<unknown>, done?: string): string | null => {
    if (!r.ok) {
      onNotice({ tone: "error", text: r.error ?? "Could not update the claim" });
      return r.error;
    }
    onNotice(done ? { tone: "info", text: done } : null);
    return null;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="rmb-filter" className="text-xs text-muted-foreground">
          Show
        </Label>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger id="rmb-filter" className="h-8 w-48 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All claims" : CLAIM_LABELS[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {claims.error && (
        <p role="alert" className="text-sm text-destructive-strong">
          Failed to load claims: {claims.error}
        </p>
      )}

      {claims.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {filter === "pending-finance" ? "No claims are waiting on Finance." : "No claims match this filter."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Claimant</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Incurred</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Receipts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pg.pageItems.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.id}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {c.employee}
                    {c.claimantRole && <div className="text-xs font-normal text-muted-foreground">{c.claimantRole}</div>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.project ?? "—"}
                    {c.category && <div>{c.category}</div>}
                  </TableCell>
                  <TableCell className="max-w-56 text-sm">{c.purpose}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{shortDate(c.incurredOn)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatCurrency(c.amount)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-0.5">
                      {c.attachments.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                      {c.attachments.map((a, i) => (
                        <button
                          key={i}
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-primary-strong underline-offset-2 hover:underline"
                          onClick={() => void openFileUrl(a.url).catch((e: Error) => onNotice({ tone: "error", text: e.message }))}
                        >
                          <Paperclip className="h-3 w-3" aria-hidden />
                          <span className="max-w-32 truncate">{a.filename}</span>
                        </button>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={CLAIM_LABELS[c.status].label} tone={CLAIM_LABELS[c.status].tone} />
                    {c.expenseId && (
                      <button type="button" className="mt-1 block font-mono text-xs text-primary-strong underline-offset-2 hover:underline" onClick={() => onOpenExpense(c.expenseId!)}>
                        {c.expenseId}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canAct && (
                      <div className="flex justify-end gap-1.5">
                        {c.status === "pending-finance" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setDialog({ kind: "approve", claim: c })}>
                              Approve
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive-strong" onClick={() => setDialog({ kind: "reject", claim: c })}>
                              Reject
                            </Button>
                          </>
                        )}
                        {c.status === "approved" && (
                          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => { setReference(""); setDialog({ kind: "pay", claim: c }); }}>
                            Mark paid
                          </Button>
                        )}
                      </div>
                    )}
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

      <DecisionDialog
        open={dialog?.kind === "approve" || dialog?.kind === "reject"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.kind === "approve" ? `Approve ${dialog.claim.id}?` : `Reject ${dialog?.claim.id ?? ""}?`}
        description={dialog ? `${formatCurrency(dialog.claim.amount)} for ${dialog.claim.employee}: ${dialog.claim.purpose}` : undefined}
        noteLabel={dialog?.kind === "approve" ? "Decision note" : "Reason"}
        noteRequired={dialog?.kind === "reject"}
        confirmLabel={dialog?.kind === "approve" ? "Approve claim" : "Reject claim"}
        destructive={dialog?.kind === "reject"}
        onSubmit={async (note) => {
          if (!dialog) return null;
          return report(dialog.kind === "approve" ? await claims.approve(dialog.claim.id, note || undefined) : await claims.reject(dialog.claim.id, note));
        }}
      />

      <DecisionDialog
        open={dialog?.kind === "pay"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Mark ${dialog?.claim.id ?? ""} paid`}
        description={
          dialog
            ? `${formatCurrency(dialog.claim.amount)} to ${dialog.claim.employee}. This creates one approved expense and books it against the budget. It cannot be undone.`
            : undefined
        }
        confirmLabel="Mark paid"
        hideNote
        disabled={reference.trim().length === 0}
        onSubmit={async () => {
          if (!dialog) return null;
          return report(await claims.pay(dialog.claim.id, reference.trim()), "Claim paid. One approved expense was created.");
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="pay-ref">Payment reference</Label>
          <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank transfer or voucher number" />
        </div>
      </DecisionDialog>
    </div>
  );
}
