import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, Trash2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayrollPeriodPicker } from "@/components/shared/payroll-period-picker";
import { ProjectPicker } from "@/components/shared/project-picker";
import { listEmployees } from "@/features/hr/hr-api";
import type { Employee } from "@/features/hr/types";
import {
  addPayrollLine,
  discardBatch,
  generatePayroll,
  getAttendanceReadiness,
  getBatchDetail,
  removePayrollLine,
  submitBatch,
  updatePayrollLine,
  type AttendanceReadiness,
  type BatchDetail,
  type PayrollLine,
  visibleRateVersions,
} from "@/features/hr/payroll-api";
import { formatCurrency } from "@/lib/format-currency";
import { Link } from "react-router-dom";

const STEPS = [
  "Period & project",
  "Attendance",
  "Earnings",
  "Government deductions",
  "Validation",
  "Submit to Finance",
] as const;

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// "2026-07" → first / last calendar day, the range verified attendance is read over.
function periodRange(period: string): { from?: string; to?: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (!m) return {};
  const last = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}

function EditableNumber({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (next: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <Input
      className="h-8 w-24 text-right tabular-nums"
      type="number"
      step="0.01"
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const next = Number(text);
        if (Number.isFinite(next) && next !== value) onCommit(next);
        else setText(String(value));
      }}
    />
  );
}

interface PayrollWizardProps {
  /** Resume a persisted draft / revision_required batch instead of starting one. */
  resumeBatchId?: string | null;
  onClose: () => void;
  /** Called after any change the list behind the wizard should reflect. */
  onChanged: () => void;
}

export function PayrollWizard({ resumeBatchId, onClose, onChanged }: PayrollWizardProps) {
  const [step, setStep] = useState(resumeBatchId ? 3 : 1);
  const [period, setPeriod] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [readiness, setReadiness] = useState<AttendanceReadiness | null>(null);
  const [batchId, setBatchId] = useState<string | null>(resumeBatchId ?? null);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [activeEmployees, setActiveEmployees] = useState<Employee[]>([]);
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acknowledgeDuplicate, setAcknowledgeDuplicate] = useState(false);

  const editable = detail ? ["draft", "revision_required"].includes(detail.batch.status) : true;

  const refresh = useCallback(async (id: string) => {
    const next = await getBatchDetail(id);
    setDetail(next);
    return next;
  }, []);

  useEffect(() => {
    if (!batchId) return;
    refresh(batchId)
      .then((d) => {
        setPeriod(d.batch.period);
        setProjectCode(d.batch.projectCode ?? "");
      })
      .catch((e) => setError(errorMessage(e, "Failed to load the batch.")));
  }, [batchId, refresh]);

  useEffect(() => {
    listEmployees({ status: "Active" })
      .then(setActiveEmployees)
      .catch(() => setActiveEmployees([]));
  }, []);

  const guard = async (work: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(errorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  // ── Step transitions ──────────────────────────────────────────────────────

  const goToAttendance = () =>
    guard(async () => {
      if (!period.trim() || !projectCode.trim()) {
        throw new Error("Choose a payroll period and a project first.");
      }
      const { from, to } = periodRange(period);
      setReadiness(await getAttendanceReadiness(projectCode.trim(), from, to));
      setStep(2);
    }, "Failed to load attendance.");

  const goToEarnings = () =>
    guard(async () => {
      if (!batchId) {
        if (!readiness || readiness.entries.length === 0) {
          throw new Error(
            "There is no verified attendance for a payable worker in this period. Verify attendance in HR Attendance first.",
          );
        }
        const created = await generatePayroll({
          period: period.trim(),
          projectCode: projectCode.trim(),
          entries: readiness.entries,
        });
        setBatchId(created.batch.id);
        onChanged();
      }
      setStep(3);
    }, "Failed to create the draft batch.");

  const editLine = (line: PayrollLine, patch: { hours?: number; overtime?: number; adjustments?: number }) =>
    guard(async () => {
      await updatePayrollLine(line.id, patch);
      await refresh(line.batchId!);
      onChanged();
    }, "Failed to update the line.");

  const addEmployee = () =>
    guard(async () => {
      if (!batchId || !addEmployeeId) return;
      await addPayrollLine(batchId, { employeeId: addEmployeeId, hoursWorked: 0 });
      setAddEmployeeId("");
      await refresh(batchId);
      onChanged();
    }, "Failed to add the employee.");

  const removeLine = (line: PayrollLine) =>
    guard(async () => {
      await removePayrollLine(line.id);
      await refresh(line.batchId!);
      onChanged();
    }, "Failed to remove the line.");

  const submit = () =>
    guard(async () => {
      if (!batchId) return;
      await submitBatch(batchId, acknowledgeDuplicate);
      setConfirmOpen(false);
      onChanged();
      onClose();
    }, "Failed to submit the batch.");

  const discard = () =>
    guard(async () => {
      if (batchId && detail?.batch.status === "draft") await discardBatch(batchId);
      onChanged();
      onClose();
    }, "Failed to discard the draft.");

  const issues = detail?.validation ?? [];
  const blocking = issues.filter((i) => i.severity === "error");
  const duplicateWarning = issues.some((i) => i.code === "duplicate_batch");
  const candidates = useMemo(
    () => activeEmployees.filter((e) => !detail?.lines.some((l) => l.empId === e.id)),
    [activeEmployees, detail],
  );

  const canSubmit = blocking.length === 0 && (!duplicateWarning || acknowledgeDuplicate);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {detail?.batch.status === "revision_required" ? "Fix and resubmit payroll" : "Generate payroll"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Nothing reaches Finance until the last step. Your work is saved as a draft on the server.
            </p>
          </div>
          <div className="flex gap-2">
            {batchId && detail?.batch.status === "draft" && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void discard()}>
                Discard draft
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Close
            </Button>
          </div>
        </div>
        <ol className="flex flex-wrap gap-2 text-xs">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`rounded-full border px-3 py-1 ${
                step === i + 1
                  ? "border-primary bg-primary/10 font-medium text-primary-strong"
                  : step > i + 1
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60"
              }`}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">
            {error}
          </div>
        )}

        {detail?.batch.status === "revision_required" && step < 6 && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
            Finance sent this batch back. Correct the figures and resubmit from step 6.
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Payroll period</label>
              <PayrollPeriodPicker
                value={period}
                onChange={setPeriod}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Project code</label>
              <ProjectPicker
                value={projectCode}
                onChange={setProjectCode}
                placeholder="Project code"
                className="h-9 rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Frequency</label>
              <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">Monthly</div>
            </div>
          </div>
        )}

        {step === 2 && readiness && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Payable workers with verified attendance</div>
                <div className="text-2xl font-semibold">{readiness.entries.length}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Unverified entries left out</div>
                <div className="text-2xl font-semibold">{readiness.unverifiedCount}</div>
                {readiness.unverifiedCount > 0 && (
                  <Link to="/attendance" className="text-xs text-primary-strong underline">
                    Review in HR Attendance
                  </Link>
                )}
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Workers excluded</div>
                <div className="text-2xl font-semibold">{readiness.excludedWorkers.length}</div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Regular hours</TableHead>
                  <TableHead className="text-right">Overtime hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readiness.entries.map((e) => (
                  <TableRow key={e.employeeId}>
                    <TableCell className="font-mono text-xs">{e.employeeId}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.hoursWorked}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.overtimeHours ?? 0}</TableCell>
                  </TableRow>
                ))}
                {readiness.entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      No verified attendance for a payable worker in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {readiness.excludedWorkers.length > 0 && (
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm">
                <div className="mb-1 font-medium">Excluded from this batch</div>
                <ul className="list-disc space-y-0.5 pl-5">
                  {readiness.excludedWorkers.map((w) => (
                    <li key={w.employeeId}>
                      {w.name} ({w.employeeId}): {w.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {step === 3 && detail && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Edit hours and adjustments. Gross is recalculated by the server after each change.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Regular hrs</TableHead>
                  <TableHead className="text-right">Overtime hrs</TableHead>
                  <TableHead className="text-right">Adjustments</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{l.name}</div>
                      <div className="font-mono text-overline text-muted-foreground">{l.empId}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <EditableNumber value={l.hours} disabled={busy || !editable} onCommit={(n) => void editLine(l, { hours: n })} />
                    </TableCell>
                    <TableCell className="text-right">
                      <EditableNumber value={l.overtime} disabled={busy || !editable} onCommit={(n) => void editLine(l, { overtime: n })} />
                    </TableCell>
                    <TableCell className="text-right">
                      <EditableNumber value={l.adjustments} disabled={busy || !editable} onCommit={(n) => void editLine(l, { adjustments: n })} />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(l.gross)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy || !editable}
                        title="Remove from batch"
                        onClick={() => void removeLine(l)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={addEmployeeId} onValueChange={setAddEmployeeId}>
                <SelectTrigger className="h-9 w-64 text-xs">
                  <SelectValue placeholder="Add an Active employee…" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} ({e.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={!addEmployeeId || busy || !editable} onClick={() => void addEmployee()}>
                Add
              </Button>
              <div className="ml-auto text-sm">
                Gross total <span className="font-semibold">{formatCurrency(detail.totals.gross)}</span>
              </div>
            </div>
          </div>
        )}

        {step === 4 && detail && (
          <div className="space-y-3">
            <Badge variant="outline" className="gap-1 rounded-full">
              <Lock className="h-3 w-3" /> Computed, cannot be typed
            </Badge>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">SSS</TableHead>
                  <TableHead className="text-right">PhilHealth</TableHead>
                  <TableHead className="text-right">Pag-IBIG</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">{l.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(l.gross)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(l.sss)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(l.philhealth)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(l.pagibig)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(l.net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">
              Rate versions used:{" "}
              {visibleRateVersions(detail.rateVersions)
                .map(([k, v]) => `${k} ${v}`)
                .join(" · ")}
            </p>
          </div>
        )}

        {step === 5 && detail && (
          <div className="space-y-3">
            {issues.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-success-strong">
                <CheckCircle2 className="h-4 w-4" /> All checks passed.
              </div>
            )}
            <ul className="space-y-2">
              {issues.map((i, idx) => (
                <li
                  key={`${i.code}-${i.empId ?? idx}`}
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                    i.severity === "error"
                      ? "border-destructive/30 bg-destructive/10"
                      : "border-warning/30 bg-warning/10"
                  }`}
                >
                  {i.severity === "error" ? (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive-strong" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" />
                  )}
                  {i.message}
                </li>
              ))}
            </ul>
            {duplicateWarning && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={acknowledgeDuplicate}
                  onChange={(e) => setAcknowledgeDuplicate(e.target.checked)}
                />
                I know another batch exists for this project and period and want to submit anyway.
              </label>
            )}
            <Button variant="outline" size="sm" disabled={busy || !batchId} onClick={() => void guard(async () => { await refresh(batchId!); }, "Failed to re-check.")}>
              Re-check
            </Button>
          </div>
        )}

        {step === 6 && detail && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Employees", String(detail.totals.employees)],
                ["Gross", formatCurrency(detail.totals.gross)],
                ["Employee deductions", formatCurrency(detail.totals.deductions)],
                ["Net payroll", formatCurrency(detail.totals.net)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-lg font-semibold">{value}</div>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Employer contributions add {formatCurrency(detail.totals.employerCost - detail.totals.gross)}, for a
              total employer cost of {formatCurrency(detail.totals.employerCost)}.
            </p>
            {!canSubmit && (
              <p className="text-sm text-destructive-strong">
                Fix the blocking checks{duplicateWarning ? " and confirm the duplicate warning" : ""} in step 5 first.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" disabled={busy || step === 1 || (step === 3 && !!resumeBatchId)} onClick={() => setStep((s) => Math.max(1, s - 1))}>
            Back
          </Button>
          {step === 1 && (
            <Button disabled={busy} onClick={() => void goToAttendance()}>
              Next: Attendance
            </Button>
          )}
          {step === 2 && (
            <Button disabled={busy} onClick={() => void goToEarnings()}>
              Next: Earnings
            </Button>
          )}
          {step >= 3 && step < 5 && (
            <Button disabled={busy || !detail} onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          )}
          {step === 5 && (
            <Button disabled={busy || blocking.length > 0} onClick={() => setStep(6)}>
              Next: Submit
            </Button>
          )}
          {step === 6 && (
            <Button disabled={busy || !canSubmit || !editable} onClick={() => setConfirmOpen(true)}>
              Submit to Finance
            </Button>
          )}
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Submit this payroll batch to Finance?"
        description="Finance will review it. You will not be able to edit it unless Finance sends it back."
        confirmLabel="Submit"
        destructive={false}
        loading={busy}
        onConfirm={() => void submit()}
      />
    </Card>
  );
}
