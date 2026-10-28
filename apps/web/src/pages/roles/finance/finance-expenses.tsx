// apps/web/src/pages/finance/finance-expenses.tsx
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "react-router";
import { useOpenOnAction } from "@/features/quick-search/useOpenOnAction";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReferencePicker } from "@/features/reference/components/ReferencePicker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProjectPicker } from "@/components/shared/project-picker";
import { Receipt, Search, Plus, Truck, ListChecks, Sparkles, Paperclip, Download } from "lucide-react";
import { formatAxisCurrency, formatCurrency } from "@/lib/format-currency";
import { downloadCsv } from "@/lib/export-csv";
import { FEATURES } from "@/config/features";
import { useAuth } from "@/auth/auth-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useExpensesController, type CreateExpenseInput } from "@/features/finance/hooks/use-expenses";
import { usePurchaseRequests } from "@/features/finance/hooks/use-purchase-requests";
import { useProcurement } from "@/features/finance/hooks/use-procurement";
import { PurchaseRequestsPanel, type Notice } from "@/features/finance/components/PurchaseRequestsPanel";
import { ProcurementPanel } from "@/features/finance/components/ProcurementPanel";
import { CategorySelect } from "@/features/finance/components/CategorySelect";
import { ManageCategoriesDialog } from "@/features/finance/components/ManageCategoriesDialog";
import { useExpenseCategories } from "@/features/finance/hooks/use-expense-categories";
import { categoryKey } from "@/features/finance/lib/category-name";
import { expenseSource } from "@/features/finance/lib/expense-source";
import { missingForExpense, missingSentence } from "@/features/finance/lib/form-hints";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

function RecordExpenseDialog({
  creating,
  error,
  onCreate,
}: {
  creating: boolean;
  error: string | null;
  onCreate: (input: CreateExpenseInput) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  useOpenOnAction("new-expense", () => setOpen(true));
  const [vendor, setVendor] = useState("");
  const [project, setProject] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");

  const reset = () => {
    setVendor("");
    setProject("");
    setCategory("");
    setAmount("");
  };

  const missing = missingForExpense({ vendor, project, category, amount });
  const canSubmit = missing.length === 0;

  const handleSubmit = async () => {
    const ok = await onCreate({ vendor: vendor.trim(), project, category, amount: Number(amount) });
    if (ok) {
      reset();
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" /> Record expense
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Vendor</Label>
            <ReferencePicker kind="vendors" value={vendor} onChange={(name) => setVendor(name)} placeholder="Select a vendor" />
          </div>
          <div className="space-y-1.5">
            <Label>Project</Label>
            <ProjectPicker value={project} onChange={setProject} className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <CategorySelect value={category} onValueChange={setCategory} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15000" />
            </div>
          </div>
        </div>
        {error && <p className="text-sm text-destructive-strong">{error}</p>}
        {!canSubmit && <p className="text-xs text-muted-foreground">{missingSentence(missing)}</p>}
        <DialogFooter>
          <Button disabled={!canSubmit || creating} onClick={handleSubmit}>
            {creating ? "Recording…" : "Record expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// An old link such as ?tab=reimbursements is not in this list, so it falls back to Tracking.
const TABS = ["tracking", "purchase-requests", "procurement", "analytics"] as const;
type Tab = (typeof TABS)[number];

export default function FinanceExpensesPage() {
  const reduced = useReducedMotion();
  const c = useExpensesController();
  // ?tab= lets the approvals queue and notifications open the right tab.
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const active: Tab = TABS.find((t) => t === requested) ?? "tracking";
  const setActive = (tab: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === "tracking") next.delete("tab");
        else next.set("tab", tab);
        return next;
      },
      { replace: true },
    );
  const purchaseRequests = usePurchaseRequests();
  const procurement = useProcurement();
  const { user } = useAuth();
  // The server enforces this too (403); the buttons are simply not offered to other roles.
  // Admin reads the ledger; recording, approving and paying are Finance Manager only (the API refuses Admin).
  const canDecide = user?.role === "finance-manager";
  const pagination = c.pagination;
  const { categories } = useExpenseCategories();
  // The Tracking filter lists every category (active and retired) plus any value on the rows shown,
  // so an old record's category can always be filtered on.
  const filterCategories = useMemo(() => {
    const seen = new Map<string, string>();
    const add = (name: string) => name && !seen.has(categoryKey(name)) && seen.set(categoryKey(name), name);
    categories.forEach((cat) => add(cat.name));
    c.breakdown.forEach((b) => add(b.category));
    pagination.pageItems.forEach((e) => add(e.category));
    return [...seen.values()];
  }, [categories, c.breakdown, pagination.pageItems]);
  const canManageCategories = user?.role === "finance-manager";
  const [pendingDecision, setPendingDecision] = useState<{ id: string; vendor: string; amount: number; decision: "approve" | "reject" } | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  /** Jump to the ledger row a payment created. */
  const openExpense = (expenseId: string) => {
    c.setQuery(expenseId);
    setActive("tracking");
  };

  const runDecision = async () => {
    if (!pendingDecision) return;
    setDeciding(true);
    const decided = pendingDecision;
    const r = await c.decide(decided.id, decided.decision);
    setDeciding(false);
    setPendingDecision(null);
    setNotice(r.ok ? (r.warning ? { tone: "warn", text: r.warning } : null) : { tone: "error", text: r.error ?? "Could not update the expense" });
    if (r.ok) toast.success(`${decided.id} ${decided.decision === "approve" ? "approved" : "rejected"}`);
    else toast.error(r.error ?? "Could not update the expense");
  };

  return (
    <PageContainer>
      <PageHeader
        title="Expense Management"
        description="Track operational expenses, purchase requests and vendor payments."
        actions={
          <>
            {canManageCategories && <ManageCategoriesDialog />}
            {canDecide && <RecordExpenseDialog creating={c.creating} error={c.createError} onCreate={c.createExpense} />}
          </>
        }
      />

      <PageContent className="space-y-6 p-4 md:p-8">
        {c.error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-strong">
            Failed to load expenses: {c.error}
          </div>
        )}

        {notice && (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={`rounded-xl border p-3 text-sm ${notice.tone === "error" ? "border-destructive/30 bg-destructive/5 text-destructive-strong" : "border-warning/40 bg-warning/10"}`}
          >
            {notice.text}
          </div>
        )}

        <KpiStrip
          items={[
            { label: "MTD spend (approved)", value: c.monthlyApproved === null ? "—" : formatCurrency(c.monthlyApproved), icon: Receipt },
            {
              label: "Open requests",
              value: purchaseRequests.loading ? "\u2026" : `${purchaseRequests.waitingOnFinance.length}`,
              icon: ListChecks,
              tone: purchaseRequests.waitingOnFinance.length > 0 ? "warn" : "neutral",
              hint: "Purchase requests waiting on Finance",
            },
            {
              label: "Procurement in transit",
              value: procurement.loading ? "\u2026" : `${procurement.inTransit.length}`,
              icon: Truck,
              hint: "Ordered or in transit",
            },
          ]}
        />

        <Tabs value={active} onValueChange={setActive}>
          <TabsList>
            <TabsTrigger value="tracking">Tracking</TabsTrigger>
            <TabsTrigger value="purchase-requests">Purchase Requests</TabsTrigger>
            <TabsTrigger value="procurement">Procurement</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="tracking" className="mt-4">
            <SectionCard
              title="Expense ledger"
              subtitle="All vendor expenses across active projects"
              actions={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={pagination.total === 0}
                    title="Export the rows currently shown as CSV (opens in Excel)"
                    onClick={async () =>
                      downloadCsv(
                        "expenses",
                        ["ID", "Vendor", "Project", "Category", "Amount", "Submitted", "Status", "Anomaly score", "Anomaly reason"],
                        (await c.fetchAllMatching()).map((e) => [e.id, e.vendor, e.project, e.category, e.amount, e.submittedAt, e.status, e.anomalyScore ?? "", e.anomalyReason ?? ""]),
                      )
                    }
                  >
                    <Download className="h-3.5 w-3.5" /> Export
                  </Button>
                  <div className="relative w-56">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={c.query}
                      onChange={(e) => c.setQuery(e.target.value)}
                      placeholder="Search vendor, ID, project…"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <Select value={c.category} onValueChange={c.setCategory}>
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {filterCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              }
            >
              {c.isLoading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/40" />
                  ))}
                </div>
              ) : pagination.total === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No expenses match your filters.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Receipt</TableHead>
                      {FEATURES.ai && <TableHead>Anomaly</TableHead>}
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      {canDecide && <TableHead className="text-right">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagination.pageItems.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-mono text-xs">{e.id}</TableCell>
                        <TableCell className="text-sm font-medium">{e.vendor}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.project}</TableCell>
                        <TableCell className="text-xs">{e.category}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(e.amount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.submittedAt}</TableCell>
                        <TableCell>
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                        </TableCell>
                        {FEATURES.ai && (
                          <TableCell>
                            {e.anomalyScore !== null && e.anomalyScore > 0 && (
                              <Badge
                                title={e.anomalyReason ?? undefined}
                                variant="outline"
                                className={`rounded-full text-overline ${
                                  e.anomalyScore > 0.6
                                    ? "border-destructive/30 text-destructive-strong bg-destructive/10"
                                    : e.anomalyScore > 0.3
                                      ? "border-warning/30 text-warning-strong bg-warning/10"
                                      : "border-success/30 text-success-strong bg-success/10"
                                }`}
                              >
                                {(e.anomalyScore * 100).toFixed(0)}%
                              </Badge>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-xs">
                          {(() => {
                            const src = expenseSource(e);
                            return src.kind === "purchase-order" ? (
                              <button type="button" className="font-mono text-primary-strong underline-offset-2 hover:underline" onClick={() => setActive("procurement")}>
                                {src.label}
                              </button>
                            ) : (
                              <span className="text-muted-foreground">{src.label}</span>
                            );
                          })()}
                        </TableCell>
                        <TableCell><StatusBadge status={e.status} /></TableCell>
                        {canDecide && (
                          <TableCell className="text-right">
                            {e.status === "pending" && (
                              <div className="flex justify-end gap-1.5">
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPendingDecision({ id: e.id, vendor: e.vendor, amount: e.amount, decision: "approve" })}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive-strong" onClick={() => setPendingDecision({ id: e.id, vendor: e.vendor, amount: e.amount, decision: "reject" })}>
                                  Reject
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {pagination.total > 0 && <DataTablePagination {...pagination} />}
            </SectionCard>
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Spending by category" subtitle="Current cycle">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={c.breakdown}>
                      <CartesianGrid stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                      <XAxis dataKey="category" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" tickFormatter={(v) => formatAxisCurrency(Number(v))} />
                      <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltip formatValue={formatCurrency} />} />
                      <Bar dataKey="amount" name="Spend" fill="var(--chart-1)" radius={[6, 6, 0, 0]} isAnimationActive={!reduced} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
              {FEATURES.ai && (
                <SectionCard title="Anomaly detection" subtitle="Rule-based: duplicate payments and amounts far above history. A person decides." badge="Decision support">
                  <ul className="space-y-2">
                    {c.anomalies
                      .map((e) => (
                        <li key={e.id} className="rounded-xl border bg-warning/5 p-3">
                          <div className="flex items-center gap-2 text-xs">
                            <Sparkles className="h-3 w-3 text-warning-strong" />
                            <span className="font-mono">{e.id}</span>
                            <span>·</span>
                            <span className="font-medium">{e.vendor}</span>
                            <span className="ml-auto font-semibold">{((e.anomalyScore ?? 0) * 100).toFixed(0)}%</span>
                          </div>
                          <p className="mt-1 text-overline text-muted-foreground">
                            {formatCurrency(e.amount)} · {e.category} · {e.project}
                          </p>
                          {e.anomalyReason && <p className="mt-1 text-xs">{e.anomalyReason}</p>}
                        </li>
                      ))}
                  </ul>
                </SectionCard>
              )}
            </div>
          </TabsContent>

          <TabsContent value="purchase-requests" className="mt-4">
            <SectionCard title="Purchase requests" subtitle="Raised from approved requirements. Approving commits the amount on the project budget.">
              <PurchaseRequestsPanel requests={purchaseRequests} orders={procurement} canDecide={canDecide} onNotice={setNotice} />
            </SectionCard>
          </TabsContent>

          <TabsContent value="procurement" className="mt-4">
            <SectionCard title="Procurement orders" subtitle="Order, ship, receive on site, then pay. Payment books one approved expense.">
              <ProcurementPanel procurement={procurement} canAct={canDecide} onNotice={setNotice} onOpenExpense={openExpense} />
            </SectionCard>
          </TabsContent>
        </Tabs>
      </PageContent>

      <ConfirmDialog
        open={pendingDecision !== null}
        onOpenChange={(open) => !open && !deciding && setPendingDecision(null)}
        title={pendingDecision?.decision === "approve" ? `Approve ${pendingDecision.id}?` : `Reject ${pendingDecision?.id ?? ""}?`}
        description={
          pendingDecision?.decision === "approve"
            ? `${formatCurrency(pendingDecision.amount)} to ${pendingDecision.vendor} will count as spend against the project budget and as cash out for its month. This cannot be undone.`
            : `${pendingDecision ? formatCurrency(pendingDecision.amount) : ""} to ${pendingDecision?.vendor ?? ""} will be rejected and will not count as spend.`
        }
        confirmLabel={pendingDecision?.decision === "approve" ? "Approve expense" : "Reject expense"}
        destructive={pendingDecision?.decision === "reject"}
        loading={deciding}
        onConfirm={() => void runDecision()}
      />
    </PageContainer>
  );
}

FinanceExpensesPage.displayName = "FinanceExpensesPage";