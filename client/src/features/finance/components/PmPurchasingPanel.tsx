import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useCallback, useEffect, useState } from "react";
import { Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { openFileUrl } from "@/lib/file-url";
import { formatCurrency } from "@/lib/format-currency";
import { RequirementRepository } from "@/features/requirements/repositories/requirement.repository";
import type { Requirement } from "@/features/requirements/types/requirements.types";
import { usePurchaseRequests } from "../hooks/use-purchase-requests";
import { useProcurement } from "../hooks/use-procurement";
import { useReimbursements } from "../hooks/use-reimbursements";
import { CLAIM_LABELS, ORDER_LABELS, PR_LABELS, shortDate } from "../lib/purchasing-labels";
import type { ActionResult } from "../types/purchasing.types";
import { DecisionDialog } from "./DecisionDialog";
import { RequirementPurchase } from "./RequirementPurchase";

type Rejecting = { kind: "request" | "claim"; id: string; label: string } | null;

/**
 * Purchasing for the Project Manager, on the Approvals page: approved
 * requirements they can raise a purchase request for (no endorsement step on
 * their own), what waits for their endorsement (Engineers' requests and
 * project staff's claims), and a read-only view of requests and orders on
 * their projects. The server scopes every list to the PM's own projects.
 */
export function PmPurchasingPanel() {
  const requests = usePurchaseRequests();
  const pgToEndorse = usePagination(requests.toEndorse, 8);
  const pgRequests = usePagination(requests.requests, 8);
  const orders = useProcurement();
  const pgOrders = usePagination(orders.orders, 8);
  const claims = useReimbursements("all");
  const pgClaimsToEndorse = usePagination(claims.toEndorse, 8);
  const pgClaims = usePagination(claims.claims, 8);
  const purchasing = { requests, orders };

  const [approved, setApproved] = useState<Requirement[]>([]);
  const pgApproved = usePagination(approved, 8);
  const [reqLoading, setReqLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Rejecting>(null);

  const loadRequirements = useCallback(async () => {
    setReqLoading(true);
    try {
      setApproved(await RequirementRepository.list({ status: "Approved" }));
    } catch {
      setApproved([]);
    } finally {
      setReqLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadRequirements();
  }, [loadRequirements]);

  const done = (r: ActionResult<unknown>, ok: string): string | null => {
    if (!r.ok) {
      setNotice(r.error);
      return r.error;
    }
    setNotice(ok);
    return null;
  };

  const waiting = requests.toEndorse.length + claims.toEndorse.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Purchasing</CardTitle>
        <p className="text-xs text-muted-foreground">
          Raise a purchase request for approved requirements, endorse what your team sends, and follow orders on your projects.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {notice && (
          <p role="status" className="rounded-lg border border-border bg-muted/40 p-2 text-sm">
            {notice}
          </p>
        )}
        <Tabs defaultValue="endorse">
          <TabsList>
            <TabsTrigger value="endorse">To endorse{waiting > 0 ? ` (${waiting})` : ""}</TabsTrigger>
            <TabsTrigger value="raise">Raise a request</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
          </TabsList>

          <TabsContent value="endorse" className="mt-3 space-y-4">
            {requests.loading || claims.loading ? (
              <Skeleton className="h-16 w-full" />
            ) : waiting === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Nothing is waiting for your endorsement.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>What</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pgToEndorse.pageItems.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.id}</TableCell>
                        <TableCell className="text-sm">
                          Purchase request: {r.title}
                          {r.justification && <div className="text-xs text-muted-foreground">{r.justification}</div>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.project}</TableCell>
                        <TableCell className="text-xs">{r.requestedBy}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" className="h-7 px-2 text-xs" onClick={async () => void done(await requests.endorse(r.id), `${r.id} endorsed and sent to Finance.`)}>
                              Endorse
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive-strong" onClick={() => setRejecting({ kind: "request", id: r.id, label: r.title })}>
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pgClaimsToEndorse.pageItems.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.id}</TableCell>
                        <TableCell className="text-sm">
                          Reimbursement claim: {c.purpose}
                          <div className="mt-0.5 flex flex-wrap gap-2">
                            {c.attachments.map((a, i) => (
                              <button
                                key={i}
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-primary-strong underline-offset-2 hover:underline"
                                onClick={() => void openFileUrl(a.url).catch((e: Error) => setNotice(e.message))}
                              >
                                <Paperclip className="h-3 w-3" aria-hidden /> {a.filename}
                              </button>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.project ?? "—"}</TableCell>
                        <TableCell className="text-xs">{c.employee}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(c.amount)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" className="h-7 px-2 text-xs" onClick={async () => void done(await claims.endorse(c.id), `${c.id} endorsed and sent to Finance.`)}>
                              Endorse
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive-strong" onClick={() => setRejecting({ kind: "claim", id: c.id, label: c.purpose })}>
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="space-y-2 pt-2">
                  <DataTablePagination {...pgToEndorse} />
                  <DataTablePagination {...pgClaimsToEndorse} />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="raise" className="mt-3">
            {reqLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : approved.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">No approved requirements on your projects yet.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {pgApproved.pageItems.map((r) => (
                  <li key={r.dbId} className="space-y-1 py-3">
                    <div className="font-mono text-xs text-muted-foreground">
                      {r.id} · {r.project} · {r.category}
                    </div>
                    <div className="text-sm font-medium">{r.title}</div>
                    <RequirementPurchase
                      requirement={{ dbId: r.dbId, title: r.title, project: r.project, category: r.category, status: r.status }}
                      purchasing={purchasing}
                      canRaise
                      canReceive={false}
                      routingHint="As the Project Manager there is no endorsement step: it goes straight to Finance."
                    />
                  </li>
                ))}
                <li className="list-none pt-2">
                  <DataTablePagination {...pgApproved} />
                </li>
              </ul>
            )}
          </TabsContent>

          <TabsContent value="status" className="mt-3 space-y-5">
            <section aria-label="Purchase requests">
              <h3 className="mb-2 text-sm font-semibold">Purchase requests</h3>
              {requests.requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">None on your projects.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Request</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pgRequests.pageItems.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.id}</TableCell>
                          <TableCell className="text-sm">{r.title}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.project}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
                          <TableCell>
                            <StatusBadge status={PR_LABELS[r.status].label} tone={PR_LABELS[r.status].tone} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="pt-2">
                    <DataTablePagination {...pgRequests} />
                  </div>
                </div>
              )}
            </section>
            <section aria-label="Orders">
              <h3 className="mb-2 text-sm font-semibold">Orders</h3>
              {orders.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">None on your projects.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>ETA</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pgOrders.pageItems.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs">{o.id}</TableCell>
                          <TableCell className="text-sm">{o.vendor}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{o.project}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(o.amount)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{shortDate(o.etaDate)}</TableCell>
                          <TableCell>
                            <StatusBadge status={ORDER_LABELS[o.status].label} tone={ORDER_LABELS[o.status].tone} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="pt-2">
                    <DataTablePagination {...pgOrders} />
                  </div>
                </div>
              )}
            </section>
            {claims.claims.length > 0 && (
              <section aria-label="Claims">
                <h3 className="mb-2 text-sm font-semibold">Claims on your projects</h3>
                <ul className="space-y-1 text-sm">
                  {pgClaims.pageItems.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-mono text-xs text-muted-foreground">{c.id}</span> {c.employee}: {c.purpose}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{formatCurrency(c.amount)}</span>
                        <StatusBadge status={CLAIM_LABELS[c.status].label} tone={CLAIM_LABELS[c.status].tone} />
                      </span>
                    </li>
                  ))}
                  <li className="list-none pt-2">
                    <DataTablePagination {...pgClaims} />
                  </li>
                </ul>
              </section>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <DecisionDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title={`Reject ${rejecting?.id ?? ""}?`}
        description={rejecting ? `${rejecting.label}. The sender is told why.` : undefined}
        noteLabel="Reason"
        noteRequired
        confirmLabel="Reject"
        destructive
        onSubmit={async (note) => {
          if (!rejecting) return null;
          const r = rejecting.kind === "request" ? await requests.reject(rejecting.id, note) : await claims.reject(rejecting.id, note);
          return done(r, `${rejecting.id} rejected.`);
        }}
      />
    </Card>
  );
}
