import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { Link } from "react-router";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Progress } from "@/components/ui/progress";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFinanceDashboardController } from "@/features/finance/hooks/use-finance-dashboard";
import {
  formatAxisCurrency,
  formatCompactCurrency,
  formatCurrency,
  formatMillions,
  formatPercent,
} from "@/lib/format-currency";
import {
  Activity,
  AlertTriangle,
  Banknote,
  ClipboardList,
  FileWarning,
  PieChart as PieIcon,
  Plus,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AnimatedBarChart } from "@/components/charts/animated-bar-chart";
import { CashFlowChart } from "@/components/charts/cash-flow-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { useExpenseCategories } from "@/features/finance/hooks/use-expense-categories";
import { groupTopN } from "@/lib/group-top-n";
import { WaitingOnYouCard } from "@/features/lifecycle/components/WaitingOnYouCard";


/** The Finance page most of the waiting items are acted on in (used by "View all"). */
const mostCommonHref = (rows: Array<{ href: string }>) => {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.href, (counts.get(r.href) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "/expenses";
};

/** "Waiting 6h", or "Waiting 2d" from 48 hours up. */
const formatWaiting = (hours: number) => (hours >= 48 ? `Waiting ${Math.floor(hours / 24)}d` : `Waiting ${hours}h`);

export default function FinanceDashboardPage() {
  const c = useFinanceDashboardController();
  const pg = usePagination(c.projectProfit, 8);

  // One slice per project (a project can have several budget rows), top 6 and the rest as "Other".
  const allocation = groupTopN(
    c.budgets.map((b) => ({ name: b.project, value: b.planned })),
    6,
  );
  // Every active category, so one with no spend shows a ₱0 bar instead of nothing.
  const { activeCategories } = useExpenseCategories();
  const expensesByCategory = (() => {
    const map = new Map<string, number>(activeCategories.map((cat) => [cat.name, 0]));
    c.expenses.forEach((e) =>
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount),
    );
    return Array.from(map, ([name, value]) => ({ name, value }));
  })();

  return (
    <PageContainer>
      <PageHeader
        title="Finance Dashboard"
        description="Live view of budgets, cash flow, payroll review queue, and AI-generated financial intelligence across the portfolio."
        actions={
          <Button
            size="sm"
            className="rounded-xl"
            disabled
            title="Not yet available — no transaction record type exists yet, distinct from Budgets and Expenses. Use Record Expense or Create Budget for now."
          >
            <Plus className="h-3.5 w-3.5" /> New transaction
          </Button>
        }
      />

      <PageContent className="space-y-6 p-4 md:p-8">
        {c.error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Failed to load finance data: {c.error}
          </div>
        )}

        {c.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-2xl bg-muted/40"
              />
            ))}
          </div>
        ) : (
          <KpiStrip
            items={[
              {
                label: "Total budget",
                value: formatCompactCurrency(c.kpis.totalBudget),
                hint: `Across ${c.budgets.length} projects`,
                icon: Wallet,
              },
              {
                label: "Utilization",
                value: formatPercent(c.kpis.utilizationPct),
                hint: "Spent / planned",
                icon: PieIcon,
                tone: c.kpis.utilizationPct > 0.85 ? "warn" : "good",
              },
              {
                label: "Remaining",
                value: formatCompactCurrency(c.kpis.remainingBudget),
                hint: "Available headroom",
                icon: Banknote,
                tone: "good",
              },
              {
                label: "Monthly expenses",
                value: formatCurrency(c.kpis.monthlyExpenses),
                hint: "Current month",
                icon: Receipt,
              },
              {
                label: "Pending payroll",
                value: `${c.kpis.pendingPayrollReviews}`,
                hint: "Batches awaiting review",
                icon: ClipboardList,
                tone: "warn",
              },
              {
                label: "Outstanding invoices",
                value: formatCurrency(c.kpis.outstandingInvoices),
                hint: "Open + overdue",
                icon: FileWarning,
                tone: "warn",
              },
              {
                label: "Cash flow (net)",
                value: formatCurrency(c.kpis.cashFlowNet),
                hint: "Latest month",
                icon: Activity,
                tone: c.kpis.cashFlowNet >= 0 ? "good" : "bad",
              },
              {
                label: "Profit margin",
                value: formatPercent(c.kpis.profitMargin),
                hint: "Portfolio rolling",
                icon: TrendingUp,
                tone: "good",
              },
            ]}
          />
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SectionCard
                title="Budget allocation"
                subtitle="Planned distribution by project"
                badge="Live"
              >
                <DonutChart
                  data={allocation}
                  formatValue={formatCompactCurrency}
                  centerCaption="Total planned"
                  ariaLabel="Budget allocation by project"
                  emptyText="No budget allocated yet"
                />
              </SectionCard>

              <SectionCard
                title="Expense distribution"
                subtitle="Spend by category, current cycle"
                badge="MTD"
              >
                <AnimatedBarChart
                  data={expensesByCategory}
                  formatValue={formatCurrency}
                  formatAxis={formatAxisCurrency}
                  ariaLabel="Expense distribution by category, current cycle"
                  emptyText="No expenses recorded this cycle yet"
                />
              </SectionCard>
            </div>

            <SectionCard
              title="Cash flow trend"
              subtitle="Inflow vs outflow (₱M)"
              badge="6 months"
            >
              {c.cashFlow.length === 0 ? (
                <div className="flex h-64 items-center justify-center rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No cash flow recorded yet. It builds up as expenses and payroll batches are approved.
                </div>
              ) : (
              <CashFlowChart
                data={c.cashFlow}
                formatValue={formatMillions}
                ariaLabel="Cash flow, inflow versus outflow"
              />
              )}
            </SectionCard>

            <SectionCard
              title="Project profitability"
              subtitle="Revenue, cost and margin by project"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead>Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pg.pageItems.map((p) => (
                    <TableRow key={p.project}>
                      <TableCell className="text-sm font-medium">
                        {p.project}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCompactCurrency(p.revenue)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCompactCurrency(p.cost)}
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm font-medium ${
                          p.margin >= 0.15
                            ? "text-success"
                            : p.margin >= 0.1
                            ? "text-warning"
                            : "text-destructive"
                        }`}
                      >
                        {formatPercent(p.margin)}
                      </TableCell>
                      <TableCell className="w-40">
                        <Progress
                          value={Math.min(100, p.margin * 400)}
                          className="h-1.5"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="pt-2">
                <DataTablePagination {...pg} />
              </div>
            </SectionCard>
          </div>

          <div className="space-y-4">
            <SectionCard
              title="Pending approvals"
              subtitle="Awaiting your sign-off"
              badge={c.approvalsError || c.approvalsLoading ? undefined : `${c.approvalsTotal}`}
            >
              {c.approvalsError ? (
                <div role="alert" className="space-y-2 text-sm">
                  <p className="text-destructive">Could not load approvals: {c.approvalsError}</p>
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={c.retryApprovals}>
                    Retry
                  </Button>
                </div>
              ) : c.approvalsLoading ? (
                <p className="text-sm text-muted-foreground">Loading approvals…</p>
              ) : c.approvals.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing is waiting for your sign-off.</p>
              ) : (
                <>
                  <ul className="space-y-2 text-sm">
                    {c.approvals.slice(0, 5).map((a) => (
                      <li key={a.id}>
                        <Link to={a.href} className="block rounded-xl border p-3 hover:bg-muted/50">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{a.kind}</span>
                            <span className="text-[11px] text-muted-foreground">{formatWaiting(a.waitingHours)}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{a.reference}</p>
                          <div className="mt-1 flex items-center justify-between text-[11px]">
                            <span>{formatCurrency(a.amount)}</span>
                            <span className="text-muted-foreground">{a.requestedBy}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {c.approvalsTotal > 5 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {c.approvalsTotal - 5} more waiting.{" "}
                      <Link to={mostCommonHref(c.approvals)} className="text-primary hover:underline">
                        View all
                      </Link>
                    </p>
                  )}
                </>
              )}
            </SectionCard>
            {/* K1: cross-project gate checks + workflow stages (separate from the
                expense / payroll / budget list above, which reads their own tables). */}
            <WaitingOnYouCard />

            <SectionCard title="Recent transactions">
              <ul className="space-y-1.5 text-xs">
                {c.expenses.slice(0, 5).map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between rounded-lg border px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{e.vendor}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {e.project} · {e.category}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs">
                        {formatCurrency(e.amount)}
                      </div>
                      <StatusBadge status={e.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        </div>

        <Card className="rounded-2xl border-warning/30 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                AI advisor disclosure.
              </span>{" "}
              Financial intelligence suggestions are advisory only. Approvals,
              disbursements and budget changes always require a human reviewer.
            </div>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}

FinanceDashboardPage.displayName = "FinanceDashboardPage";
