import { useEffect, useState } from "react";
import { PageHeader } from "@/components/refine-ui/views/page-header";

import {
  decidePayrollReview,
  listPayrollReviewPage,
  type PayrollReviewBatch,
} from "@/features/finance/apis/payroll-review-api";
import {
  getBatchDetail,
  reasonLabel,
  REJECTION_REASONS,
  type BatchDetail,
  type PayrollLine,
} from "@/features/hr/payroll-api";
import { BatchStatusPill } from "@/features/hr/components/batch-status-pill";
import { PayslipDialog } from "@/features/hr/components/payslip-dialog";
import { PayslipButton } from "@/features/hr/components/payslip-button";
import { PayrollRulesNotice } from "@/features/hr/components/PayrollRulesNotice";
import { PayrollTraceButton, PayrollTraceSheet } from "@/features/hr/components/PayrollTraceSheet";
import { visibleRateVersions } from "@/features/hr/payroll-api";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useIsReadOnlyAdmin } from "@/hooks/use-read-only-admin";
import { usePagination } from "@/hooks/use-pagination";
import { useServerList } from "@/hooks/use-server-list";
import { qk } from "@/lib/query-keys";
import { formatCurrency } from "@/lib/format-currency";
import { downloadCsv } from "@/lib/export-csv";
import { Download } from "lucide-react";

const ALL = "all";

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

export default function FinancePayrollReviewPage() {
  const readOnly = useIsReadOnlyAdmin();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const [periodFilter, setPeriodFilter] = useState<string | null>(null);
  // Batches are paged (and filtered by period) on the server.
  const pagination = useServerList<PayrollReviewBatch, { periods: string[] }>({
    key: (params) => qk.finance.payrollReview(params),
    filters: { period: periodFilter ?? "" },
    fetchPage: async (params, signal) => {
      const page = await listPayrollReviewPage(params.page, params.limit, periodFilter, signal);
      return { items: page.items, total: page.total, pages: page.pages, extra: { periods: page.periods } };
    },
  });
  const loading = pagination.loading;
  const periods = pagination.extra?.periods ?? [];
  const [reasonCode, setReasonCode] = useState("");
  const [comment, setComment] = useState("");
  const [confirming, setConfirming] = useState<"approved" | "rejected" | null>(null);
  const [payslipLine, setPayslipLine] = useState<PayrollLine | null>(null);
  const [traceLineId, setTraceLineId] = useState<number | null>(null);

  async function loadBatches() {
    setError("");
    await pagination.reload();
  }

  // Every batch the filter selects (for the CSV), fetched page by page.
  async function fetchAllBatches() {
    const all: PayrollReviewBatch[] = [];
    for (let page = 1; ; page += 1) {
      const next = await listPayrollReviewPage(page, 100, periodFilter);
      all.push(...next.items);
      if (page >= (next.pages ?? 1) || next.items.length === 0) break;
    }
    return all;
  }

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    getBatchDetail(selectedId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const linePagination = usePagination(detail?.lines ?? [], 8);

  const batch = detail?.batch ?? null;
  const t = detail?.totals;
  const pending = batch?.status === "pending";
  // Reject needs a reason, and a comment when the reason is Other.
  const rejectReady = reasonCode !== "" && (reasonCode !== "other" || comment.trim() !== "");

  async function handleDecision(decision: "approved" | "rejected") {
    if (!batch) return;
    try {
      setProcessing(true);
      setError("");
      await decidePayrollReview(batch.id, {
        decision,
        reasonCode: decision === "rejected" ? reasonCode : undefined,
        comment: comment.trim() || undefined,
      });
      setConfirming(null);
      setReasonCode("");
      setComment("");
      await loadBatches();
      setDetail(await getBatchDetail(batch.id));
    } catch (err) {
      // A stale tab deciding an already-decided batch gets the server's 409
      // text here; reload so the buttons disable.
      setConfirming(null);
      setError(err instanceof Error ? err.message : "Failed to update payroll decision.");
      await loadBatches();
      setDetail(await getBatchDetail(batch.id).catch(() => detail));
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader title="Payroll Review" description="Loading payroll batches..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Payroll Review"
        description="Review payroll batches submitted by Human Resources."
        actions={
        <>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs hover:bg-muted disabled:opacity-50"
          disabled={pagination.total === 0}
          title={detail ? "Export the open batch's payroll lines as CSV" : "Export the batches shown as CSV"}
          onClick={async () =>
            detail
              ? downloadCsv(
                  `payroll-${detail.batch.id}`,
                  ["Employee ID", "Name", "Role", "Hours", "Overtime", "Adjustments", "Gross", "SSS", "PhilHealth", "Pag-IBIG", "Total deductions", "Net", "Employer cost"],
                  detail.lines.map((l) => [l.empId, l.name, l.role, l.hours, l.overtime, l.adjustments, l.gross, l.sss, l.philhealth, l.pagibig, l.deductions, l.net, l.employerCost]),
                )
              : downloadCsv(
                  "payroll-batches",
                  ["Batch", "Period", "Group", "Project", "Employees", "Overtime hours", "Gross", "Deductions", "Net", "Employer cost", "Status", "Reviewed by", "Reviewed at"],
                  (await fetchAllBatches()).map((b) => [b.id, b.period, b.group, b.projectCode ?? "", b.employees, b.overtimeHours, b.grossPayroll, b.deductions, b.netPayroll, b.employerCost ?? "", b.status, b.reviewedBy ?? "", b.reviewedAt ?? ""]),
                )
          }
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>
        <Select value={periodFilter ?? ALL} onValueChange={(v) => setPeriodFilter(v === ALL ? null : v)}>
          <SelectTrigger className="h-9 w-44 text-xs">
            <SelectValue placeholder="All periods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All periods</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </>
        }
      />

      <PayrollRulesNotice />

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>
      )}

      {pagination.total === 0 && !periodFilter ? (
        <div className="rounded-lg border p-6">
          <p className="text-muted-foreground">No payroll batches are currently available for review.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <div className="rounded-lg border">
            <div className="border-b p-4">
              <h2 className="font-semibold">Payroll Batches</h2>
            </div>
            <div className="divide-y">
              {pagination.pageItems.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedId(b.id)}
                  className={`w-full p-4 text-left transition hover:bg-muted ${selectedId === b.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">{b.id}</p>
                      <p className="text-sm text-muted-foreground">
                        {b.period} · {b.projectCode ?? "All projects"}
                      </p>
                      <p className="text-sm text-muted-foreground">{b.group}</p>
                    </div>
                    <BatchStatusPill status={b.status} />
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t p-2">
              <DataTablePagination {...pagination} />
            </div>
          </div>

          <div className="rounded-lg border">
            {!selectedId ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">Select a payroll batch to review.</p>
              </div>
            ) : detailLoading || !batch || !t || !detail ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">Loading batch…</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between border-b p-4">
                  <div>
                    <h2 className="font-semibold">Payroll Details</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {batch.id} · round {batch.round}
                    </p>
                  </div>
                  <BatchStatusPill status={batch.status} />
                </div>

                <div className="space-y-5 p-4">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Project</p>
                      <p className="font-medium">{batch.projectCode || "All Projects"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Period</p>
                      <p className="font-medium">{batch.period}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Employees</p>
                      <p className="font-medium">{batch.employees}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                  <section className="rounded-xl border p-3">
                    <Figure label="Gross payroll" value={formatCurrency(t.gross)} strong />
                    <div className="my-1 border-t" />
                    <p className="text-xs font-medium text-muted-foreground">Employee deductions</p>
                    <Figure label="SSS" value={formatCurrency(t.sss)} />
                    <Figure label="PhilHealth" value={formatCurrency(t.philhealth)} />
                    <Figure label="Pag-IBIG" value={formatCurrency(t.pagibig)} />
                    <Figure label="Total deductions" value={formatCurrency(t.deductions)} strong />
                    <div className="my-1 border-t" />
                    <Figure label="Net payroll" value={formatCurrency(t.net)} strong />
                  </section>

                  <section className="rounded-xl border p-3">
                    <p className="text-xs font-medium text-muted-foreground">Employer contributions</p>
                    <Figure label="SSS" value={formatCurrency(t.employerSss)} />
                    <Figure label="EC" value={formatCurrency(t.employerEc)} />
                    <Figure label="PhilHealth" value={formatCurrency(t.employerPhilhealth)} />
                    <Figure label="Pag-IBIG" value={formatCurrency(t.employerPagibig)} />
                    <Figure
                      label="Total employer contributions"
                      value={formatCurrency(t.employerEc + t.employerSss + t.employerPhilhealth + t.employerPagibig)}
                      strong
                    />
                    <div className="my-1 border-t" />
                    <Figure label="Total employer cost" value={formatCurrency(t.employerCost)} strong />
                  </section>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Rate versions:{" "}
                    {visibleRateVersions(detail.rateVersions)
                      .filter(([k]) => k !== "overtime")
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ")}
                    {detail.needsVerification.length > 0 &&
                      ` · needs verification: ${detail.needsVerification.join("; ")}`}
                  </p>

                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Per-employee lines</p>
                    <div className="@container rounded-lg border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/60">
                          <tr>
                            <th className="px-2 py-1.5 text-left">Employee</th>
                            <th className="px-2 py-1.5 text-right">Hours</th>
                            <th className="px-2 py-1.5 text-right">Gross</th>
                            <th className="hidden px-2 py-1.5 text-right @2xl:table-cell">SSS</th>
                            <th className="hidden px-2 py-1.5 text-right @2xl:table-cell">PhilHealth</th>
                            <th className="hidden px-2 py-1.5 text-right @2xl:table-cell">Pag-IBIG</th>
                            <th className="hidden px-2 py-1.5 text-right @2xl:table-cell">Deductions</th>
                            <th className="px-2 py-1.5 text-right">Net</th>
                            <th className="px-2 py-1.5 text-right"><span className="sr-only">Payslip</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {linePagination.pageItems.map((line) => (
                            <tr key={line.id} className="border-t">
                              <td className="px-2 py-1.5">{line.name}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">
                                {line.hours}
                                {line.overtime ? ` + ${line.overtime} OT` : ""}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(line.gross)}</td>
                              <td className="hidden px-2 py-1.5 text-right tabular-nums @2xl:table-cell">{formatCurrency(line.sss)}</td>
                              <td className="hidden px-2 py-1.5 text-right tabular-nums @2xl:table-cell">{formatCurrency(line.philhealth)}</td>
                              <td className="hidden px-2 py-1.5 text-right tabular-nums @2xl:table-cell">{formatCurrency(line.pagibig)}</td>
                              <td className="hidden px-2 py-1.5 text-right tabular-nums @2xl:table-cell">{formatCurrency(line.deductions)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(line.net)}</td>
                              <td className="px-2 py-1.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <PayslipButton line={line} onOpen={setPayslipLine} />
                                  <PayrollTraceButton lineId={line.id} onOpen={setTraceLineId} />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="pt-2">
                      <DataTablePagination {...linePagination} />
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Decision history</p>
                    {detail.decisions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No decisions yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {detail.decisions.map((d) => (
                          <li key={d.id} className="rounded-lg border p-2 text-xs">
                            <div className="font-medium">
                              Round {d.round}: {d.action === "approved" ? "Approved" : "Rejected"} by {d.decidedBy}
                            </div>
                            <div className="text-muted-foreground">{new Date(d.decidedAt).toLocaleString()}</div>
                            {d.reasonCode && <div>Reason: {reasonLabel(d.reasonCode)}</div>}
                            {d.comment && <div>{d.comment}</div>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Finance has no edit controls on lines — only the decision. */}
                  <div className="space-y-3 border-t pt-4">
                    <div>
                      <label className="text-sm font-medium">Rejection reason</label>
                      <Select value={reasonCode} onValueChange={setReasonCode} disabled={!pending}>
                        <SelectTrigger className="mt-1 h-9 text-xs">
                          <SelectValue placeholder="Required to reject" />
                        </SelectTrigger>
                        <SelectContent>
                          {REJECTION_REASONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label htmlFor="payroll-comment" className="text-sm font-medium">
                        Comment{" "}
                        <span className="font-normal text-muted-foreground">
                          (required when the reason is Other)
                        </span>
                      </label>
                      <textarea
                        id="payroll-comment"
                        value={comment}
                        disabled={!pending}
                        onChange={(event) => setComment(event.target.value)}
                        className="mt-1 min-h-20 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 disabled:opacity-50"
                      />
                    </div>
                    {!readOnly && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!pending || processing || !rejectReady}
                        title={!pending ? `Batch is ${batch.status}` : !rejectReady ? "Choose a reason (and a comment for Other)" : undefined}
                        onClick={() => setConfirming("rejected")}
                        className="flex-1 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={!pending || processing}
                        title={!pending ? `Batch is ${batch.status}` : undefined}
                        onClick={() => setConfirming("approved")}
                        className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Approve Payroll
                      </button>
                    </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming === "approved" ? "Approve this payroll batch?" : "Send this batch back to HR?"}
        description={
          confirming === "approved"
            ? "Approving locks the batch and books its total employer cost against the project's Labor budget."
            : `HR will see the reason (${reasonLabel(reasonCode)}) and can correct and resubmit.`
        }
        confirmLabel={confirming === "approved" ? "Approve" : "Reject"}
        destructive={confirming === "rejected"}
        loading={processing}
        onConfirm={() => confirming && void handleDecision(confirming)}
      />

      <PayslipDialog line={payslipLine} onClose={() => setPayslipLine(null)} />
      <PayrollTraceSheet lineId={traceLineId} onClose={() => setTraceLineId(null)} />
    </div>
  );
}
