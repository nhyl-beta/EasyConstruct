// src/pages/roles/human-resources/hr-payroll.tsx
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useServerList } from "@/hooks/use-server-list";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { queryClient, STALE } from "@/lib/query-client";
import { KpiMini, PageHeader, StatusBadge } from "@/pages/roles/shared/shared-hr";
import { useMemo, useState } from "react";
import { useOpenOnAction } from "@/features/quick-search/useOpenOnAction";
import {
  getContributionReport,
  listPayrollAll,
  listPayrollBatches,
  listPayrollPage,
  type PayrollLineTotals,
  reasonLabel,
  getBatchDetail,
  type Agency,
  type BatchDecision,
  type PayrollBatch,
  type PayrollLine,
} from "@/features/hr/payroll-api";
import { BatchStatusPill } from "@/features/hr/components/batch-status-pill";
import { PayrollWizard } from "@/features/hr/components/payroll-wizard";
import { PayslipDialog } from "@/features/hr/components/payslip-dialog";
import { PayslipButton } from "@/features/hr/components/payslip-button";
import { PayrollRulesNotice } from "@/features/hr/components/PayrollRulesNotice";
import { PayrollTraceButton, PayrollTraceSheet } from "@/features/hr/components/PayrollTraceSheet";
import { useIsReadOnlyAdmin } from "@/hooks/use-read-only-admin";
import { AlertTriangle, ArrowUpRight, Building2, CheckCircle2, Download, FileText, RefreshCw, Wallet } from "lucide-react";
import { downloadCsv } from "@/lib/export-csv";
import { formatCompactCurrency, formatCurrency } from "@/lib/format-currency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_PERIODS = "all";

const AGENCIES: Array<{ key: Agency; label: string }> = [
  { key: "sss", label: "SSS" },
  { key: "philhealth", label: "PhilHealth" },
  { key: "pagibig", label: "Pag-IBIG" },
];

export default function HRPayrollPage() {
  const readOnly = useIsReadOnlyAdmin();
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  useOpenOnAction("generate-payroll", () => setWizardOpen(true));
  const [resumeBatchId, setResumeBatchId] = useState<string | null>(null);
  const [payslipLine, setPayslipLine] = useState<PayrollLine | null>(null);
  const [traceLineId, setTraceLineId] = useState<number | null>(null);
  // F1: the filter drives what the tracksheet below actually displays.
  const [trackFilterPeriod, setTrackFilterPeriod] = useState<string | null>(null);

  // The tracksheet is paged by the server; the headline sums (gross, net,
  // employer cost, hours) are totals over every line the period selects.
  const pagination = useServerList<PayrollLine, PayrollLineTotals>({
    key: (params) => qk.payroll.lines(params),
    fetchPage: async (params) => {
      const page = await listPayrollPage({ page: params.page, limit: params.limit, period: trackFilterPeriod });
      return { items: page.items, total: page.total, pages: page.pages, extra: page.totals };
    },
    filters: { period: trackFilterPeriod },
  });
  const rows = pagination.pageItems;
  const lineTotals = pagination.extra ?? { lines: 0, gross: 0, net: 0, employerCost: 0, hours: 0 };

  const batchesQuery = useQuery({
    queryKey: qk.payroll.batches(),
    queryFn: listPayrollBatches,
    staleTime: STALE.list,
  });
  const batches: PayrollBatch[] = batchesQuery.data ?? [];

  // For each batch Finance sent back, fetch why - shown at the top.
  const revisionIds = useMemo(
    () => batches.filter((b) => b.status === "revision_required").map((b) => b.id),
    [batches],
  );
  const rejectionQuery = useQuery({
    queryKey: [...qk.payroll.all, "rejections", revisionIds] as const,
    queryFn: async () => {
      const details = await Promise.all(revisionIds.map((id) => getBatchDetail(id)));
      return Object.fromEntries(
        details.map((d) => [d.batch.id, [...d.decisions].reverse().find((x) => x.action === "rejected")]),
      ) as Record<string, BatchDecision | undefined>;
    },
    enabled: revisionIds.length > 0,
    staleTime: STALE.list,
  });
  const lastRejection = rejectionQuery.data ?? {};

  const loading = pagination.loading || batchesQuery.isLoading;
  const refreshing = pagination.fetching || batchesQuery.isFetching;
  const loadError = pagination.error ?? (batchesQuery.error as Error | null);
  const shownError = error ?? loadError?.message ?? null;

  // Refresh = invalidate the payroll queries; whatever is on screen refetches.
  const loadPayroll = () => queryClient.invalidateQueries({ queryKey: qk.payroll.all });

  const trackPeriods = useMemo(
    () => Array.from(new Set(batches.map((b) => b.period))).sort().reverse(),
    [batches],
  );

  const revisionBatches = batches.filter((b) => b.status === "revision_required");
  const awaitingApproval = batches.filter((b) => b.status === "pending").length;

  const openWizard = (batchId: string | null) => {
    setResumeBatchId(batchId);
    setWizardOpen(true);
  };

  const handleTrackFilterChange = (period: string | null) => {
    setTrackFilterPeriod(period);
  };

  const handleExportCsv = async () => {
    // The export covers the whole period, not only the page on screen.
    const allRows = await listPayrollAll(trackFilterPeriod);
    downloadCsv(
      "payroll-tracksheet",
      [
        "Employee ID", "Name", "Role", "Period", "Hours", "Overtime", "Adjustments", "Gross",
        "SSS", "PhilHealth", "Pag-IBIG", "Deductions", "Net",
        "Employer SSS", "Employer EC", "Employer PhilHealth", "Employer Pag-IBIG", "Employer cost", "Status",
      ],
      allRows.map((r) => [
        r.empId, r.name, r.role, r.period, r.hours, r.overtime, r.adjustments, r.gross,
        r.sss, r.philhealth, r.pagibig, r.deductions, r.net,
        r.employerSss, r.employerEc, r.employerPhilhealth, r.employerPagibig, r.employerCost, r.status,
      ]),
    );
  };

  // Liabilities per agency for one approved period. The system only reports
  // them; it does not remit anything to SSS, PhilHealth or Pag-IBIG.
  const handleExportContributions = async (agency: Agency, label: string) => {
    if (!trackFilterPeriod) return;
    try {
      const report = await getContributionReport(agency, trackFilterPeriod);
      downloadCsv(
        `${agency}-contributions-${trackFilterPeriod}`,
        [
          "Batch", "Project", "Employee ID", "Name", "Period",
          `${label} employee share`, `${label} employer share`,
          ...(agency === "sss" ? ["EC (employer)"] : []), "Rate version",
        ],
        report.map((r) => [
          r.batchId, r.projectCode ?? "", r.empId, r.name, r.period, r.employeeShare, r.employerShare,
          ...(agency === "sss" ? [r.ec ?? 0] : []), r.rateVersion,
        ]),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export the contribution report.");
    }
  };

  const totals = lineTotals;
  const period = trackFilterPeriod ?? rows[0]?.period ?? "Current period";
  const totalHours = lineTotals.hours;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6">
      <PageHeader
        title="Payroll"
        subtitle="Gross labor, deductions, net payable, and approvals"
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
             
              onClick={() => void loadPayroll()}
              disabled={loading || refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : "Refresh Status"}
            </Button>
            <Button
              size="sm"
              variant="outline"
             
              disabled={pagination.total === 0}
              title={pagination.total === 0 ? "No payroll lines to export" : "Export the tracksheet as CSV"}
              onClick={handleExportCsv}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            {!readOnly && (
              <Button size="sm" onClick={() => openWizard(null)}>
                Generate Payroll <ArrowUpRight className="h-4 w-4" />
              </Button>
            )}
          </>
        }
      />

      <PayrollRulesNotice />

      {shownError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">
          {shownError}
        </div>
      )}

      {revisionBatches.map((b) => {
        const why = lastRejection[b.id];
        return (
          <div
            key={b.id}
            className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="text-sm">
              <div className="font-semibold">
                Finance sent {b.id} ({b.period}) back for revision
              </div>
              <div className="mt-1">
                Reason: <span className="font-medium">{reasonLabel(why?.reasonCode ?? "") || "Not recorded"}</span>
                {why?.comment ? ` — ${why.comment}` : ""}
              </div>
            </div>
            {!readOnly && (
              <Button size="sm" onClick={() => openWizard(b.id)}>
                Fix and resubmit
              </Button>
            )}
          </div>
        );
      })}

      {wizardOpen && (
        <PayrollWizard
          key={resumeBatchId ?? "new"}
          resumeBatchId={resumeBatchId}
          onClose={() => setWizardOpen(false)}
          onChanged={() => void loadPayroll()}
        />
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiMini label="Gross labor (period)" value={formatCompactCurrency(totals.gross)} tone="info" icon={Wallet} />
        <KpiMini label="Net payable" value={formatCompactCurrency(totals.net)} tone="success" icon={CheckCircle2} />
        <KpiMini label="Employer cost" value={formatCompactCurrency(totals.employerCost)} tone="warning" icon={Building2} />
        <KpiMini label="Awaiting Finance" value={String(awaitingApproval)} tone="warning" icon={AlertTriangle} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batches</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Round</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                    No batches yet.
                  </TableCell>
                </TableRow>
              )}
              {batches.slice(0, 8).map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.id}</TableCell>
                  <TableCell className="text-sm">{b.projectCode ?? "—"}</TableCell>
                  <TableCell className="text-sm">{b.period}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.employees}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(b.netPayroll)}</TableCell>
                  <TableCell className="text-sm">{b.round}</TableCell>
                  <TableCell>
                    <BatchStatusPill status={b.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {!readOnly && (b.status === "draft" || b.status === "revision_required") && (
                      <Button size="sm" variant="outline" onClick={() => openWizard(b.id)}>
                        {b.status === "draft" ? "Continue" : "Fix and resubmit"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Tracksheet</CardTitle>
            <p className="text-xs text-muted-foreground">
              {period} · {pagination.total} employees · {totalHours.toLocaleString()} hours logged
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {AGENCIES.map((a) => (
              <Button
                key={a.key}
                size="sm"
                variant="outline"
                className="text-xs"
                disabled={!trackFilterPeriod}
                title={trackFilterPeriod ? `Export ${a.label} contribution report` : "Choose a period to export a contribution report"}
                onClick={() => void handleExportContributions(a.key, a.label)}
              >
                <FileText className="h-3.5 w-3.5" /> {a.label}
              </Button>
            ))}
            <Select
              value={trackFilterPeriod ?? ALL_PERIODS}
              onValueChange={(v) => handleTrackFilterChange(v === ALL_PERIODS ? null : v)}
            >
              <SelectTrigger className="h-9 w-40 text-xs">
                <SelectValue placeholder="All periods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PERIODS}>All periods</SelectItem>
                {trackPeriods.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">OT</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">SSS</TableHead>
                <TableHead className="text-right">PhilHealth</TableHead>
                <TableHead className="text-right">Pag-IBIG</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                    Loading payroll…
                  </TableCell>
                </TableRow>
              )}
              {!loading && pagination.total === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                    No payroll generated yet for this period.
                  </TableCell>
                </TableRow>
              )}
              {pagination.pageItems.map((p) => (
                <TableRow key={p.id} className="hover:bg-muted/40">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="bg-primary-soft text-overline font-semibold text-primary-strong">
                          {p.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="font-mono text-overline text-muted-foreground">{p.empId}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.role}</TableCell>
                  <TableCell className="text-right text-sm">{p.hours}</TableCell>
                  <TableCell className="text-right text-sm">{p.overtime}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatCurrency(p.gross)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(p.sss)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(p.philhealth)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(p.pagibig)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">−{formatCurrency(p.deductions)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">{formatCurrency(p.net)}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <PayslipButton line={p} onOpen={setPayslipLine} />
                      <PayrollTraceButton lineId={p.id} onOpen={setTraceLineId} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {pagination.total > 0 && (
            <div className="px-4 pt-3">
              <DataTablePagination {...pagination} />
            </div>
          )}
        </CardContent>
      </Card>

      <PayslipDialog line={payslipLine} onClose={() => setPayslipLine(null)} />
      <PayrollTraceSheet lineId={traceLineId} onClose={() => setTraceLineId(null)} />
    </div>
  );
}
