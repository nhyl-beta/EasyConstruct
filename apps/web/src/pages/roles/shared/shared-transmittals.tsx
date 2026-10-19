import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useState } from "react";
import { Link } from "react-router";
import { Plus, Printer } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/auth-context";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TransmittalBuilderDialog } from "@/features/requests/components/TransmittalBuilderDialog";
import { formatDate } from "@/features/requests/components/RequestBadges";
import { useTransmittals } from "@/features/requests/hooks/useRequests";
import { TransmittalRepository } from "@/features/requests/repositories/request.repository";
import type { Transmittal } from "@/features/requests/types/request.types";

const WRITERS = new Set(["project-manager", "engineer", "architect", "admin"]);

function ReceiptDialog({ t, onOpenChange, onDone }: { t: Transmittal | null; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [office, setOffice] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={t !== null} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log receipt</DialogTitle>
          <DialogDescription>{t?.controlNo} — who received the documents.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" />
          <Input value={office} onChange={(e) => setOffice(e.target.value)} placeholder="Department / office" aria-label="Department or office" />
        </div>
        <DialogFooter>
          <Button
           
            disabled={busy || name.trim().length < 2 || !t}
            onClick={async () => {
              if (!t) return;
              setBusy(true);
              try {
                await TransmittalRepository.acknowledge(t.id, { name: name.trim(), office: office.trim() || undefined });
                toast.success("Receipt logged");
                setName("");
                setOffice("");
                onDone();
                onOpenChange(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not log the receipt");
              } finally {
                setBusy(false);
              }
            }}
          >
            Log receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Transmittal cover sheets: build, issue, log receipts, print. */
export default function SharedTransmittals() {
  const { user } = useAuth();
  const canWrite = WRITERS.has(user?.role ?? "");
  const { transmittals, loading, error, reload } = useTransmittals();
  const pg = usePagination(transmittals, 10);
  const [building, setBuilding] = useState(false);
  const [receiving, setReceiving] = useState<Transmittal | null>(null);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Transmittals"
        description="Cover sheets for documents sent out with RFIs and RFAs."
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setBuilding(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New transmittal
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive-strong">
          <span>Couldn't load transmittals. {error}</span>
          <Button size="sm" variant="outline" onClick={reload}>Retry</Button>
        </div>
      ) : loading && transmittals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading transmittals…</p>
      ) : transmittals.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No transmittals yet.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Control no.</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="hidden md:table-cell">To</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pg.pageItems.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.controlNo}</TableCell>
                  <TableCell className="whitespace-normal text-sm">
                    {t.subject}
                    <span className="block font-mono text-overline text-muted-foreground">{t.projectCode}</span>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{t.toName}</TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">{formatDate(t.dateIssued)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-full text-overline capitalize">{t.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {canWrite && t.status === "draft" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={async () => {
                            try {
                              await TransmittalRepository.issue(t.id);
                              toast.success(`${t.controlNo} issued`);
                              reload();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Could not issue it");
                            }
                          }}
                        >
                          Issue
                        </Button>
                      )}
                      {canWrite && t.status !== "draft" && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setReceiving(t)}>
                          Log receipt
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" asChild aria-label={`Print ${t.controlNo}`}>
                        <Link to={`/transmittals/${t.id}/print`} target="_blank" rel="noreferrer">
                          <Printer className="h-4 w-4" />
                        </Link>
                      </Button>
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

      <TransmittalBuilderDialog open={building} onOpenChange={setBuilding} onCreated={reload} />
      <ReceiptDialog t={receiving} onOpenChange={(o) => !o && setReceiving(null)} onDone={reload} />
    </div>
  );
}

SharedTransmittals.displayName = "SharedTransmittals";
