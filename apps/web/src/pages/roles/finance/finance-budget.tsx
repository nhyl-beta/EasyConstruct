import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProjectPicker } from "@/components/shared/project-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBudgetAllocationController } from "@/features/finance/budgets/controllers/budget-allocation.controller.js";
import { useBudgetAdjustments } from "@/features/finance/budgets/hooks/useBudgetAdjustments";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useBudgets } from "@/features/finance/budgets/hooks/useBudgets";
import { missingForBudget, missingSentence } from "@/features/finance/lib/form-hints";
import { formatAxisCurrency, formatCompactCurrency, formatCurrency } from "@/lib/format-currency";
import { useEffect, useMemo, useState } from "react";
import { useOpenOnAction } from "@/features/quick-search/useOpenOnAction";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  FileText,
  GitBranch,
  Plus,
  ScrollText,
  Search,
  Shuffle,
  TrendingUp,
  Wallet,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  BUDGET_CHART_COLORS,
  CHART_AXIS_STYLE,
  CHART_GRID_STYLE,
} from "@/features/finance/budgets/constants/chart-colors";
import type { AdjustmentKind } from "@/features/finance/budgets/types/budget-adjustment.types";

const kindIcon: Record<AdjustmentKind, typeof ArrowUpRight> = {
  increase: ArrowUpRight,
  decrease: ArrowDownRight,
  transfer: Shuffle,
  emergency: AlertTriangle,
};

const kindTone: Record<AdjustmentKind, string> = {
  increase: "text-destructive-strong bg-destructive/10",
  decrease: "text-success-strong bg-success/10",
  transfer: "text-primary-strong bg-primary/10",
  emergency: "text-warning-strong bg-warning/15",
};

import { ApprovalStepper } from "@/components/ui/approval-stepper";
import { ApprovalTimeline } from "@/components/ui/approval-timeline";
import { Textarea } from "@/components/ui/textarea";
import { useBudgetApproval } from "@/features/finance/budgets/hooks/useBudgetApproval";
import { Check, Download, RotateCcw, X } from "lucide-react";
import { downloadCsv } from "@/lib/export-csv";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { CreateBudgetInput } from "@/features/finance/budgets/controllers/budget.controllers";
import { OwnerDepartmentPicker } from "@/components/shared/owner-department-picker";
import { useProjects } from "@/features/projects/hooks/useProjects";
import { CategorySelect } from "@/features/finance/components/CategorySelect";
import { ManageCategoriesDialog } from "@/features/finance/components/ManageCategoriesDialog";
import { useAuth } from "@/auth/auth-context";

function NewBudgetDialog({
  creating,
  error,
  onCreate,
}: {
  creating: boolean;
  error: string | null;
  onCreate: (input: CreateBudgetInput) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  useOpenOnAction("new-budget", () => setOpen(true));
  const [project, setProject] = useState("");
  const [category, setCategory] = useState("");
  // The budgets table stores only a project code. Echoing the selected
  // project's name and client back into the form is what tells the Finance
  // Manager which engagement they are committing money to — a bare code
  // ("WMT-204") is not something the commercial side recognises.
  const { projects } = useProjects();
  const selectedProject = projects.find((p) => p.code === project);
  const [owner, setOwner] = useState("");
  const [planned, setPlanned] = useState("");
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));

  const reset = () => {
    setProject("");
    setCategory("");
    setOwner("");
    setPlanned("");
    setFiscalYear(String(new Date().getFullYear()));
  };

  const missing = missingForBudget({ project, category, owner, planned, fiscalYear });
  const canSubmit = missing.length === 0;

  const handleSubmit = async () => {
    const ok = await onCreate({
      project,
      category,
      owner,
      planned: Number(planned),
      fiscalYear,
    });
    if (ok) {
      reset();
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-3.5 w-3.5" />
          Create budget
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create budget</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <ProjectPicker value={project} onChange={setProject} className="w-full" />
            {selectedProject && (
              <p className="text-xs text-muted-foreground">
                {selectedProject.name} · client{" "}
                <span className="font-medium text-foreground">
                  {selectedProject.client}
                </span>
                {selectedProject.contractValue != null && (
                  <> · contract {formatCurrency(selectedProject.contractValue, selectedProject.currency)}</>
                )}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <CategorySelect value={category} onValueChange={setCategory} />
            </div>
            <div className="space-y-1.5">
              <Label>Fiscal year</Label>
              <Input value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} placeholder="2026" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Owner / department</Label>
            <OwnerDepartmentPicker value={owner} onChange={setOwner} />
          </div>
          <div className="space-y-1.5">
            <Label>Planned amount</Label>
            <Input
              type="number"
              min={0}
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
              placeholder="500000"
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive-strong">{error}</p>}
        {!canSubmit && <p className="text-xs text-muted-foreground">{missingSentence(missing)}</p>}
        <DialogFooter>
          <Button disabled={!canSubmit || creating} onClick={handleSubmit}>
            {creating ? "Creating…" : "Create budget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FinanceBudget() {
  const reduced = useReducedMotion();
  const [tab, setTab] = useState("overview");
  const c = useBudgets();
  const { user } = useAuth();
  const approval = useBudgetApproval(c.budgets, c.reload);

  const allocation = useBudgetAllocationController(
    c.budgets.map((b) => ({
      id: b.id,
      budgetId: b.id,
      department: b.owner,
      category: b.category,
      amount: b.planned,
      consumed: b.spent,
      status: b.status,
      createdAt: b.createdAt,
    })),
  );

  // The register table renders one page at a time (the charts, approvals and
  // CSV below still work on the whole set).
  const budgetPagination = usePagination(c.budgets, 10);

  const adjustments = useBudgetAdjustments();

  // Budgets store a project code only; the client each code belongs to lives
  // on the project record. Resolved here so the register reads the way the
  // commercial side of the business does.
  const { projects } = useProjects();
  const clientByCode = useMemo(
    () => new Map(projects.map((p) => [p.code, p.client])),
    [projects],
  );

  // Approvals tab: find a budget by what a person remembers about it — its
  // name (category), project code, who requested it (the owning department) —
  // and narrow by where it sits in the pipeline.
  const [approvalQuery, setApprovalQuery] = useState("");
  const [approvalStatus, setApprovalStatus] = useState("all");
  const filteredApprovalBudgets = useMemo(() => {
    const q = approvalQuery.trim().toLowerCase();
    return approval.budgets.filter((b) => {
      if (approvalStatus !== "all" && b.status !== approvalStatus) return false;
      if (!q) return true;
      return [String(b.id), b.project, clientByCode.get(b.project) ?? "", b.category, b.owner, b.fiscalYear]
        .some((field) => field.toLowerCase().includes(q));
    });
  }, [approval.budgets, approvalQuery, approvalStatus, clientByCode]);

  // Keep the pipeline on a budget that is actually in the filtered results.
  const { selectedBudgetId: approvalSelectedId, setSelectedBudgetId: setApprovalSelectedId } = approval;
  useEffect(() => {
    if (filteredApprovalBudgets.length === 0) return;
    if (!filteredApprovalBudgets.some((b) => String(b.id) === approvalSelectedId)) {
      setApprovalSelectedId(String(filteredApprovalBudgets[0]!.id));
    }
  }, [filteredApprovalBudgets, approvalSelectedId, setApprovalSelectedId]);
  const approvalSelectionVisible = filteredApprovalBudgets.some((b) => String(b.id) === approvalSelectedId);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Budget Management"
        description="Manage project budgets, allocations, adjustments, and historical baselines across the portfolio."
        actions={
          <>
            {user?.role === "finance-manager" && <ManageCategoriesDialog />}
            <Button
              variant="outline"
              size="sm"
             
              disabled={c.budgets.length === 0}
              title="Export the budget register as CSV (opens in Excel)"
              onClick={() =>
                downloadCsv(
                  "budgets",
                  ["ID", "Project", "Client", "Category", "Owner", "Fiscal year", "Planned", "Spent", "Status"],
                  c.budgets.map((b) => [b.id, b.project, clientByCode.get(b.project) ?? "", b.category, b.owner, b.fiscalYear, b.planned, b.spent, b.status]),
                )
              }
            >
              <Download className="mr-1 h-3.5 w-3.5" /> Export
            </Button>
            {user?.role === "finance-manager" && (
              <NewBudgetDialog creating={c.creating} error={c.error} onCreate={c.createBudget} />
            )}
          </>
        }
      />

      <KpiStrip
        items={[
          {
            label: "Total planned",
            value: formatCompactCurrency(c.totals.planned),
            icon: Wallet,
          },
          {
            label: "Committed",
            value: formatCompactCurrency(c.totals.committed),
            icon: GitBranch,
          },
          {
            label: "Spent",
            value: formatCompactCurrency(c.totals.spent),
            icon: TrendingUp,
            tone: "warn",
          },
          {
            label: "Remaining",
            value: formatCompactCurrency(c.totals.remaining),
            icon: Banknote,
            tone: "good",
          },
        ]}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="allocation">
            Allocation
          </TabsTrigger>
          <TabsTrigger value="adjustments">
            Adjustments
          </TabsTrigger>
          <TabsTrigger value="approval">
            Approvals
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ──────────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-48">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={c.query}
                onChange={(e) => c.setQuery(e.target.value)}
                placeholder="Search project, owner…"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Select value={c.fy} onValueChange={c.setFy}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All FY</SelectItem>
                <SelectItem value="FY2026">FY2026</SelectItem>
                <SelectItem value="FY2025">FY2025</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {c.loading ? (
            <div className="text-sm text-muted-foreground">
              Loading budgets…
            </div>
          ) : c.budgets.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No budgets match your filters.
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="w-40">Utilization</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgetPagination.pageItems.map((b) => {
                  const pct = b.planned
                    ? Math.round((b.spent / b.planned) * 100)
                    : 0;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">
                        {b.id}
                      </TableCell>
                      <TableCell className="font-medium">
                        {b.project}
                        {clientByCode.get(b.project) && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {clientByCode.get(b.project)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{b.category}</TableCell>
                      <TableCell>{b.owner}</TableCell>
                      <TableCell className="text-right">
                        {formatCompactCurrency(b.planned)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCompactCurrency(b.committed)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCompactCurrency(b.spent)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Progress value={pct} className="h-1.5" />
                          <div className="text-overline text-muted-foreground">
                            {pct}% used
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={b.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="border-t px-4 py-3">
              <DataTablePagination {...budgetPagination} />
            </div>
            </>
          )}
        </TabsContent>

        {/* ── Allocation ────────────────────────────────────────────── */}
        <TabsContent value="allocation" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border p-5">
              <h3 className="mb-3 text-sm font-medium">
                Allocation by category
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocation.byCategory}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={2}
                      isAnimationActive={!reduced}
                    >
                      {allocation.byCategory.map((entry) => (
                        <Cell key={entry.label} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<ChartTooltip formatValue={formatCompactCurrency} total={allocation.byCategory.reduce((s, d) => s + d.value, 0)} />}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid gap-2">
                {allocation.byCategory.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.label}</span>
                    </div>
                    <span className="font-medium">
                      {formatCompactCurrency(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border p-5">
              <h3 className="mb-3 text-sm font-medium">
                Allocation by department
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={allocation.byDepartment}
                    layout="vertical"
                    margin={{ left: 20 }}
                  >
                    <CartesianGrid {...CHART_GRID_STYLE} horizontal={false} />
                    <XAxis
                      type="number"
                      {...CHART_AXIS_STYLE}
                      tickFormatter={(v) => formatAxisCurrency(Number(v))}
                    />
                    <YAxis
                      dataKey="label"
                      type="category"
                      {...CHART_AXIS_STYLE}
                      width={90}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                      content={<ChartTooltip formatValue={formatCompactCurrency} />}
                    />
                    <Bar
                      dataKey="value"
                      name="Amount"
                      fill={BUDGET_CHART_COLORS[1]}
                      radius={[0, 6, 6, 0]}
                      isAnimationActive={!reduced}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Adjustments ───────────────────────────────────────────── */}
        <TabsContent value="adjustments" className="mt-4 space-y-4">
          <KpiStrip
            items={[
              {
                label: "Total requests",
                value: adjustments.totals.count.toString(),
                icon: ScrollText,
              },
              {
                label: "Pending",
                value: adjustments.totals.pending.toString(),
                icon: FileText,
                tone: "warn",
              },
              {
                label: "Increases",
                value: `+${formatCompactCurrency(
                  adjustments.totals.increases,
                )}`,
                icon: ArrowUpRight,
                tone: "bad",
              },
              {
                label: "Decreases",
                value: formatCompactCurrency(adjustments.totals.decreases),
                icon: ArrowDownRight,
                tone: "good",
              },
            ]}
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-48">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={adjustments.query}
                onChange={(e) => adjustments.setQuery(e.target.value)}
                placeholder="Search reason, requester…"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Select
              value={adjustments.kind}
              onValueChange={(v) =>
                adjustments.setKind(v as AdjustmentKind | "all")
              }
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="increase">Increase</SelectItem>
                <SelectItem value="decrease">Decrease</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={adjustments.status}
              onValueChange={adjustments.setStatus}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending-review">Pending Review</SelectItem>
                <SelectItem value="finance-review">Finance Review</SelectItem>
                <SelectItem value="manager-review">Manager Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {adjustments.loading ? (
            <div className="text-sm text-muted-foreground">
              Loading adjustments…
            </div>
          ) : adjustments.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No adjustments match your filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Original</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead className="text-right">New total</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.items.map((a) => {
                  const Icon = kindIcon[a.kind];
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">
                        {a.id}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-overline font-medium capitalize ${
                            kindTone[a.kind]
                          }`}
                        >
                          <Icon className="h-3 w-3" />
                          {a.kind}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {formatCompactCurrency(a.originalAmount)}
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm font-medium ${
                          a.adjustmentAmount > 0
                            ? "text-destructive-strong"
                            : "text-success-strong"
                        }`}
                      >
                        {a.adjustmentAmount > 0 ? "+" : ""}
                        {formatCompactCurrency(a.adjustmentAmount)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCompactCurrency(a.newAmount)}
                      </TableCell>
                      <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                        {a.reason}
                      </TableCell>
                      <TableCell className="text-overline text-muted-foreground">
                        {a.requestedAt}
                        <div>{a.requestedBy}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={a.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ── Approvals ─────────────────────────────────────────────── */}
        <TabsContent value="approval" className="mt-4 space-y-4">
          <div className="rounded-2xl border border-border p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="relative min-w-56 flex-1 sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={approvalQuery}
                  onChange={(e) => setApprovalQuery(e.target.value)}
                  placeholder="Search by budget, project code or requester…"
                  aria-label="Search budgets awaiting approval"
                  className="h-9 pl-9"
                />
              </div>
              <Select value={approvalStatus} onValueChange={setApprovalStatus}>
                <SelectTrigger aria-label="Filter by status" className="h-9 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending-review">Pending review</SelectItem>
                  <SelectItem value="finance-review">Finance review</SelectItem>
                  <SelectItem value="manager-review">Manager review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                </SelectContent>
              </Select>
              {(approvalQuery || approvalStatus !== "all") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 text-xs"
                  onClick={() => {
                    setApprovalQuery("");
                    setApprovalStatus("all");
                  }}
                >
                  Clear
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {filteredApprovalBudgets.length} of {approval.budgets.length} budgets
              </span>
            </div>

            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Approval pipeline</h3>
              <div className="w-72">
                <SearchableSelect
                  value={approvalSelectionVisible ? approvalSelectedId : undefined}
                  onValueChange={setApprovalSelectedId}
                  options={filteredApprovalBudgets.map((b) => ({
                    value: String(b.id),
                    label: `${b.id} · ${b.project}`,
                    description: `${b.category} · ${b.owner}`,
                  }))}
                  sort="none"
                  placeholder="Select a budget"
                  searchPlaceholder="Search budgets…"
                  emptyText="No budgets match"
                  className="h-8 rounded-lg text-xs"
                />
              </div>
            </div>

            {filteredApprovalBudgets.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No budgets match the current search and filter.
              </div>
            ) : approval.loading ? (
              <div className="text-sm text-muted-foreground">
                Loading pipeline…
              </div>
            ) : (
              <ApprovalStepper
                current={approval.current}
                steps={approval.steps}
              />
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border p-5 md:col-span-2">
              <h3 className="mb-3 text-sm font-medium">Approval timeline</h3>
              <ApprovalTimeline steps={approval.steps} />
            </div>

            <div className="rounded-2xl border border-border p-5">
              <h3 className="mb-3 text-sm font-medium">Decision panel</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-overline font-medium text-muted-foreground">
                    Comments
                  </label>
                  <Textarea
                    rows={5}
                    value={approval.comment}
                    onChange={(e) => approval.setComment(e.target.value)}
                    placeholder="Provide context for your decision…"
                  />
                </div>
                {user?.role === "finance-manager" && (
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    className="bg-success text-success-foreground hover:bg-success/90"
                    disabled={
                      approval.submitting || approval.current === "approved"
                    }
                    onClick={() => approval.decide("approved")}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                   
                    disabled={approval.submitting}
                    onClick={() => approval.decide("returned")}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Return
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive-strong"
                    disabled={approval.submitting}
                    onClick={() => approval.decide("rejected")}
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
                )}
                <div className="rounded-xl border bg-muted/40 p-3 text-overline text-muted-foreground">
                  Every decision is signed, timestamped, and written to the
                  immutable audit log.
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

FinanceBudget.displayName = "FinanceBudget";
