// "My claims": a person's own reimbursement claims, and the form to file one.
// Engineers, Site Personnel, Project Managers, Architects and HR claim costs
// they paid out of pocket. Finance decides and pays them on Expense Management;
// project staff's claims are endorsed by the project's PM first.
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useState } from "react";
import { Paperclip, Plus } from "lucide-react";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { ProjectPicker } from "@/components/shared/project-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EXPENSE_CATEGORIES } from "@/config/expense-categories";
import { DecisionDialog } from "@/features/finance/components/DecisionDialog";
import { useReimbursements } from "@/features/finance/hooks/use-reimbursements";
import { CLAIM_LABELS, shortDate } from "@/features/finance/lib/purchasing-labels";
import { uploadReceipts } from "@/features/finance/lib/upload-receipts";
import type { ReimbursementClaim } from "@/features/finance/types/purchasing.types";
import { useOpenOnAction } from "@/features/quick-search/useOpenOnAction";
import { openFileUrl } from "@/lib/file-url";
import { formatCurrency } from "@/lib/format-currency";
import { Clock, FileCheck2, Wallet } from "lucide-react";

const todayIso = () => new Date().toLocaleDateString("en-CA");

function NewClaimDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: ReturnType<typeof useReimbursements>["create"];
}) {
  const [project, setProject] = useState("");
  const [category, setCategory] = useState("");
  const [incurredOn, setIncurredOn] = useState(todayIso());
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!project && !!category && !!incurredOn && purpose.trim().length >= 3 && Number(amount) > 0 && files.length > 0 && !busy;

  const reset = () => {
    setProject("");
    setCategory("");
    setIncurredOn(todayIso());
    setPurpose("");
    setAmount("");
    setFiles([]);
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const attachments = await uploadReceipts(files);
      const r = await onCreate({ project, category, incurredOn, purpose: purpose.trim(), amount: Number(amount), attachments });
      if (r.ok) {
        reset();
        onOpenChange(false);
      } else {
        setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload the receipt");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New claim</DialogTitle>
          <DialogDescription>Claim something you paid for the job. A receipt is required.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <ProjectPicker value={project} onChange={setProject} className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="claim-cat">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="claim-cat" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-date">Date incurred</Label>
              <Input id="claim-date" type="date" max={todayIso()} value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="claim-purpose">Purpose</Label>
            <Input id="claim-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Nails and tie wire bought on site" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="claim-amount">Amount</Label>
            <Input id="claim-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="450" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="claim-files">Receipt (required)</Label>
            <Input id="claim-files" type="file" multiple accept="image/*,application/pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            {files.length > 0 && <p className="text-xs text-muted-foreground">{files.map((f) => f.name).join(", ")}</p>}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive-strong">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? "Sending…" : "Submit claim"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SharedClaimsPage() {
  const claims = useReimbursements("mine");
  const pg = usePagination(claims.claims, 10);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<ReimbursementClaim | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useOpenOnAction("new-claim", () => setCreating(true));

  const waiting = claims.claims.filter((c) => c.status === "pending-pm" || c.status === "pending-finance" || c.status === "approved");
  const paid = claims.claims.filter((c) => c.status === "paid");
  const sum = (list: ReimbursementClaim[]) => list.reduce((s, c) => s + c.amount, 0);

  return (
    <PageContainer>
      <PageHeader
        title="My claims"
        description="Costs you paid out of pocket. Your Project Manager endorses project claims, then Finance approves and pays."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> New claim
          </Button>
        }
      />
      <PageContent className="space-y-6 p-4 md:p-8">
        <KpiStrip
          items={[
            { label: "Claims", value: claims.loading ? "…" : `${claims.claims.length}`, icon: FileCheck2 },
            { label: "Waiting", value: claims.loading ? "…" : formatCurrency(sum(waiting)), icon: Clock, tone: waiting.length > 0 ? "warn" : "neutral", hint: `${waiting.length} claim${waiting.length === 1 ? "" : "s"}` },
            { label: "Paid to you", value: claims.loading ? "…" : formatCurrency(sum(paid)), icon: Wallet, tone: "good" },
          ]}
        />

        {notice && (
          <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {notice}
          </p>
        )}

        <SectionCard title="Your claims" subtitle="Newest first">
          {claims.error && (
            <p role="alert" className="text-sm text-destructive-strong">
              Failed to load your claims: {claims.error}
            </p>
          )}
          {claims.loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : claims.claims.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">You have not filed a claim yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Project</TableHead>
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
                      <TableCell className="max-w-56 text-sm">
                        {c.purpose}
                        {c.decisionNote && <div className="text-xs text-muted-foreground">Note: {c.decisionNote}</div>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.project ?? "—"}
                        {c.category && <div>{c.category}</div>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{shortDate(c.incurredOn)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatCurrency(c.amount)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-0.5">
                          {c.attachments.map((a, i) => (
                            <button
                              key={i}
                              type="button"
                              className="inline-flex items-center gap-1 text-xs text-primary-strong underline-offset-2 hover:underline"
                              onClick={() => void openFileUrl(a.url).catch((e: Error) => setNotice(e.message))}
                            >
                              <Paperclip className="h-3 w-3" aria-hidden />
                              <span className="max-w-32 truncate">{a.filename}</span>
                            </button>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={CLAIM_LABELS[c.status].label} tone={CLAIM_LABELS[c.status].tone} />
                        {c.status === "paid" && c.paymentReference && <div className="mt-1 text-xs text-muted-foreground">Ref {c.paymentReference}</div>}
                      </TableCell>
                      <TableCell className="text-right">
                        {(c.status === "pending-pm" || c.status === "pending-finance") && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive-strong" onClick={() => setCancelling(c)}>
                            Cancel
                          </Button>
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
        </SectionCard>
      </PageContent>

      <NewClaimDialog open={creating} onOpenChange={setCreating} onCreate={claims.create} />

      <DecisionDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={`Cancel ${cancelling?.id ?? ""}?`}
        description="A claim can be cancelled only while it is still waiting for a decision."
        confirmLabel="Cancel claim"
        destructive
        hideNote
        onSubmit={async () => {
          if (!cancelling) return null;
          const r = await claims.cancel(cancelling.id);
          if (!r.ok) return r.error;
          setNotice(`${cancelling.id} was cancelled.`);
          return null;
        }}
      />
    </PageContainer>
  );
}

SharedClaimsPage.displayName = "SharedClaimsPage";
