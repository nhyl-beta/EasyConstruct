// Attendance exceptions for HR (objectives fix 2.3). Lists records that need a
// look and people with no record who are likely absent. The system records
// nothing by itself: a likely absence only becomes a record when HR presses
// "Mark absent".
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DecisionSupportLabel } from "@/components/shared/decision-support-label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EXCEPTION_LABELS,
  listAttendanceExceptions,
  markAbsent,
  type AttendanceExceptionItem,
  type AttendanceExceptionPage,
  type ExceptionKind,
} from "../attendance-api";

const PAGE_SIZE = 20;
const KINDS = Object.keys(EXCEPTION_LABELS) as ExceptionKind[];

const TONE: Record<ExceptionKind, string> = {
  missing_clock_out: "border-warning/30 text-warning-strong",
  late: "border-warning/30 text-warning-strong",
  outside_geofence: "border-destructive/30 text-destructive-strong",
  duplicate_entry: "border-destructive/30 text-destructive-strong",
  missing_photo: "border-warning/30 text-warning-strong",
  absent_task_due: "border-destructive/30 text-destructive-strong",
  likely_absent: "border-info/30 text-info-strong",
};

export function AttendanceExceptionsPanel({ onChanged }: { onChanged?: () => void }) {
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AttendanceExceptionPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AttendanceExceptionItem | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listAttendanceExceptions({ page, pageSize: PAGE_SIZE, kind }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load exceptions");
    } finally {
      setLoading(false);
    }
  }, [page, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmAbsent = async () => {
    if (!confirming?.projectCode) return;
    setSaving(true);
    try {
      await markAbsent({ employeeId: confirming.employeeId, projectCode: confirming.projectCode, logDate: confirming.logDate });
      toast.success(`${confirming.employeeName} marked absent on ${confirming.logDate}`);
      setConfirming(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the absence");
    } finally {
      setSaving(false);
    }
  };

  const total = data?.total ?? 0;
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Exceptions</CardTitle>
            <p className="text-xs text-muted-foreground">
              {data ? `${data.from} to ${data.to}. ` : ""}Shift starts {data?.rules.shiftStart ?? "08:00"}, late after {data?.rules.lateGraceMinutes ?? 15} minutes.
              Nothing is recorded until you confirm it.
            </p>
          </div>
          <DecisionSupportLabel />
        </div>
        {data && (
          <div className="flex flex-wrap gap-1.5">
            {KINDS.filter((k) => data.summary[k] > 0).map((k) => (
              <Badge key={k} variant="outline" className={`rounded-full text-overline ${TONE[k]}`}>
                {EXCEPTION_LABELS[k]}: {data.summary[k]}
              </Badge>
            ))}
          </div>
        )}
        <Select
          value={kind}
          onValueChange={(v) => {
            setKind(v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter by exception type" className="h-8 w-48 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All exceptions</SelectItem>
            {KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {EXCEPTION_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Flag</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Checking attendance…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-destructive-strong">
                  Couldn't load exceptions. {error}
                </TableCell>
              </TableRow>
            )}
            {!loading && !error && data && data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No attendance exceptions in this period.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((i, idx) => (
              <TableRow key={`${i.kind}-${i.recordId ?? "none"}-${i.employeeId}-${i.logDate}-${idx}`}>
                <TableCell>
                  <div className="text-sm font-medium">{i.employeeName}</div>
                  <div className="font-mono text-overline text-muted-foreground">{i.employeeId}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">{i.logDate}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`rounded-full text-overline ${TONE[i.kind]}`}>
                    {EXCEPTION_LABELS[i.kind]}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-normal text-xs text-muted-foreground">{i.message}</TableCell>
                <TableCell className="text-right">
                  {i.kind === "likely_absent" && i.projectCode && (
                    <Button size="sm" variant="outline" onClick={() => setConfirming(i)}>
                      Mark absent
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {total > 0 && (
          <div className="flex items-center justify-between gap-2 border-t px-4 pt-3 text-xs text-muted-foreground">
            <span>
              {total} exception{total === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular-nums">
                Page {page} of {data?.pages ?? 1}
              </span>
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= (data?.pages ?? 1)} onClick={() => setPage(page + 1)} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !saving && !open && setConfirming(null)}
        title="Mark this person absent?"
        description={
          confirming
            ? `${confirming.employeeName} has no attendance record for ${confirming.logDate}. This records an Absent day for ${confirming.projectCode}.`
            : ""
        }
        confirmLabel={saving ? "Saving…" : "Mark absent"}
        destructive={false}
        loading={saving}
        onConfirm={() => void confirmAbsent()}
      />
    </Card>
  );
}
