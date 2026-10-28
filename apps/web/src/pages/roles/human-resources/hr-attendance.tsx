import { useIsReadOnlyAdmin } from "@/hooks/use-read-only-admin";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  KpiMini,
  PageHeader,
  StatusBadge,
} from "@/pages/roles/shared/shared-hr";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  bulkVerifyAttendance,
  getAttendanceRecord,
  setAttendanceVerification,
  type AttendanceEntry,
} from "@/features/hr/attendance-api";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useAttendancePaged } from "@/features/hr/hooks/use-attendance-paged";
import { AttendanceVerificationDialog } from "@/components/hr/attendance-verification-dialog";
import { SavedFiltersBar } from "@/components/shared/SavedFiltersBar";
import { AttendanceExceptionsPanel } from "@/features/hr/components/AttendanceExceptionsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Camera,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  MapPin,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

const VERIFICATION_OPTIONS = ["Pending", "Verified", "Flagged"];
const DAY_STATUS_OPTIONS = ["Present", "Late", "Absent", "On Leave", "Half Day"];

export default function HRAttendancePage() {
  const readOnly = useIsReadOnlyAdmin();
  // An "outside the site radius" alert links here with ?highlight=<record id>: show just that person's
  // clock-in for that day, highlighted, with a way back to the whole log.
  const [params, setParams] = useSearchParams();
  const highlightId = Number(params.get("highlight")) || null;
  const [focus, setFocus] = useState<{ employeeId: string; logDate: string } | null>(null);
  const [focusError, setFocusError] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightId) {
      setFocus(null);
      setFocusError(null);
      return;
    }
    let active = true;
    getAttendanceRecord(highlightId)
      .then((r) => active && setFocus({ employeeId: r.employeeId, logDate: r.logDate }))
      .catch(() => active && setFocusError("That clock-in could not be found, or you may not have access to it."));
    return () => {
      active = false;
    };
  }, [highlightId]);
  const a = useAttendancePaged(focus ? { search: focus.employeeId, dateFrom: focus.logDate, dateTo: focus.logDate } : undefined);
  useEffect(() => {
    if (!highlightId || a.loading) return;
    document.getElementById(`attendance-row-${highlightId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId, a.loading, a.rows]);
  // The clock-in HR is currently confirming — photo and coordinates side by
  // side in AttendanceVerificationDialog.
  const [reviewing, setReviewing] = useState<AttendanceEntry | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const { reload } = a;
  const verify = useCallback(
    async (id: number, status: "Verified" | "Flagged", remarks: string) => {
      await setAttendanceVerification(id, status, remarks || undefined);
      await reload();
    },
    [reload],
  );

  const summary = a.summary;
  const bulkCount = summary?.bulkVerifiable ?? 0;
  const skippedForReview = Math.max((summary?.pending ?? 0) - bulkCount, 0);

  // Verifies every pending clock-in (across all pages) that has no geofence
  // breach or failed photo; those stay for HR to check one by one.
  const runBulkVerify = async () => {
    setBulkBusy(true);
    try {
      const verified = await bulkVerifyAttendance({ search: a.query.trim() || undefined });
      toast.success(`${verified} clock-in${verified === 1 ? "" : "s"} verified`);
      setConfirmBulk(false);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk verify failed — try again");
    } finally {
      setBulkBusy(false);
    }
  };

  const heatmap = a.heatmap;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6">
      <PageHeader
        title="Attendance"
        subtitle="Clock-ins, geofence verification, and photo authentication"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiMini
          label="Verified"
          value={summary ? String(summary.verified) : "…"}
          tone="success"
          icon={CheckCircle2}
        />
        <KpiMini
          label="Pending verification"
          value={summary ? String(summary.pending) : "…"}
          tone="warning"
          icon={Clock}
        />
        <KpiMini
          label="Geofence flags"
          value={summary ? String(summary.geofenceFlags) : "…"}
          tone="destructive"
          icon={MapPin}
        />
        <KpiMini
          label="Photo auth failures"
          value={summary ? String(summary.photoFailures) : "…"}
          tone="destructive"
          icon={Camera}
        />
      </div>

      <Tabs defaultValue="log" className="gap-4">
        <TabsList>
          <TabsTrigger value="log">Attendance log</TabsTrigger>
          <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
        </TabsList>
        <TabsContent value="log">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Attendance log</CardTitle>
              <p className="text-xs text-muted-foreground">
                Clock-ins, geofence and photo authentication results
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!readOnly && (<>
              <Button
                size="sm"
                variant="outline"
               
                disabled={a.loading || bulkCount === 0}
                title={
                  bulkCount === 0
                    ? "No pending clock-ins without a geofence or photo problem"
                    : `Verify ${bulkCount} pending clock-in${bulkCount === 1 ? "" : "s"}`
                }
                onClick={() => setConfirmBulk(true)}
              >
                Bulk verify{bulkCount > 0 ? ` (${bulkCount})` : ""}
              </Button>
              <Button size="sm">
                <ShieldCheck className="h-4 w-4" /> Resolve flags
              </Button>
              </>)}
            </div>
          </CardHeader>

          {highlightId && (
            <div role="status" className="mx-6 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              <span className="flex-1">
                {focusError ?? (focus ? `Showing the clock-in you were alerted about (${focus.employeeId}, ${focus.logDate}).` : "Finding the clock-in you were alerted about…")}
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setParams({}, { replace: true })}>
                Show the whole log
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={a.query}
                onChange={(e) => a.setQuery(e.target.value)}
                placeholder="Search name, ID or site…"
                aria-label="Search attendance"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Select value={a.filters.verification} onValueChange={(v) => a.setFilter("verification", v)}>
              <SelectTrigger aria-label="Filter by verification" className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All verification</SelectItem>
                {VERIFICATION_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={a.filters.status} onValueChange={(v) => a.setFilter("status", v)}>
              <SelectTrigger aria-label="Filter by attendance status" className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All attendance</SelectItem>
                {DAY_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {a.hasActiveFilters && (
              <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={a.clearFilters}>
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
            <SavedFiltersBar
              page="hr-attendance"
              current={{ search: a.query, verification: a.filters.verification, status: a.filters.status }}
              hasActive={a.hasActiveFilters}
              onApply={(f: { search: string; verification: string; status: string }) => {
                a.setQuery(f.search);
                a.setFilter("verification", f.verification);
                a.setFilter("status", f.status);
              }}
            />
          </div>

          <CardContent className="overflow-hidden px-0 [&_[data-slot=table-container]]:overflow-x-hidden [&_td]:whitespace-normal [&_td]:break-words [&_td]:px-2 [&_th]:px-2">
            {/* table-fixed + percentage widths (sum 100%) so long names/badges
                wrap instead of forcing the table wider than the card. */}
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[18%]">Employee</TableHead>
                  <TableHead className="w-[12%]">Site</TableHead>
                  <TableHead className="w-[10%]">Clock in</TableHead>
                  <TableHead className="w-[10%]">Clock out</TableHead>
                  <TableHead className="w-[8%] text-right">Hours</TableHead>
                  <TableHead className="w-[14%]">Geofence</TableHead>
                  <TableHead className="w-[12%]">Photo</TableHead>
                  <TableHead className="w-[10%]">Attendance</TableHead>
                  <TableHead className="w-[6%] text-right">Check</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.loading && a.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      Loading attendance…
                    </TableCell>
                  </TableRow>
                )}
                {a.error && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-destructive-strong">
                      Couldn't load attendance. {a.error}
                    </TableCell>
                  </TableRow>
                )}
                {!a.loading && !a.error && a.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      {a.hasActiveFilters ? "No attendance records match these filters." : "No attendance records yet."}
                    </TableCell>
                  </TableRow>
                )}
                {a.rows.map((l) => (
                  <TableRow
                    key={l.id}
                    id={`attendance-row-${l.id}`}
                    aria-current={l.id === highlightId ? "true" : undefined}
                    className={l.id === highlightId ? "bg-warning/10 ring-2 ring-inset ring-warning/60 hover:bg-warning/15" : "hover:bg-muted/40"}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="bg-primary-soft text-overline font-semibold text-primary-strong">
                            {l.initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{l.name}</div>
                          <div className="font-mono text-overline text-muted-foreground">
                            {l.employeeId}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.site}
                      {l.source === "Sheet" && (
                        <Badge
                          variant="outline"
                          className="mt-1 flex w-fit items-center gap-1 rounded-full text-overline"
                          title="Imported from a site attendance spreadsheet — needs verification"
                        >
                          <FileSpreadsheet className="h-3 w-3" /> Sheet
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.clockIn}</TableCell>
                    <TableCell className="font-mono text-xs">{l.clockOut ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{l.hours.toFixed(1)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`rounded-full text-overline ${
                          l.geofence === "Inside"
                            ? "border-success/30 text-success-strong"
                            : l.geofence === "Edge"
                            ? "border-warning/30 text-warning-strong"
                            : l.geofence === "Outside"
                            ? "border-destructive/30 text-destructive-strong"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        <MapPin className="mr-1 h-3 w-3" /> {l.geofence}
                      </Badge>
                      {l.distanceFromSiteM != null && (
                        <div className="mt-0.5 text-overline tabular-nums text-muted-foreground">
                          {l.distanceFromSiteM} m from site
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        title="Check the photo and location for this clock-in"
                        onClick={() => setReviewing(l)}
                        className="cursor-pointer"
                      >
                        <Badge
                          variant="outline"
                          className={`rounded-full text-overline ${
                            l.photo === "Verified"
                              ? "border-success/30 text-success-strong"
                              : l.photo === "Pending"
                              ? "border-warning/30 text-warning-strong"
                              : l.photo === "Not captured"
                              ? "border-border text-muted-foreground"
                              : "border-destructive/30 text-destructive-strong"
                          }`}
                        >
                          <Camera className="mr-1 h-3 w-3" /> {l.photo}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={l.attendanceStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      {!readOnly && (
                        <Button size="sm" variant="outline" onClick={() => setReviewing(l)}>
                          Verify
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {a.total > 0 && (
              <div className="border-t px-2 pt-3">
                <DataTablePagination
                  currentPage={a.page}
                  pageCount={a.pages}
                  setCurrentPage={a.setPage}
                  pageSize={a.pageSize}
                  setPageSize={a.setPageSize}
                  total={a.total}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Site heatmap</CardTitle>
            <p className="text-xs text-muted-foreground">
              Clock-ins per day · last {heatmap?.days.length ?? 14} days
            </p>
          </CardHeader>
          <CardContent>
            {!heatmap ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : heatmap.sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No clock-ins in the last {heatmap.days.length} days.
              </p>
            ) : (
              <div className="space-y-3">
                {heatmap.sites.map(({ site, total, max, cells }) => (
                  <div key={site}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium">{site}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {total} in {heatmap.days.length}d
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {cells.map(({ day, count }) => (
                        <div
                          key={day}
                          className={`h-5 flex-1 rounded-sm ${count === 0 ? "bg-muted" : ""}`}
                          style={
                            count === 0
                              ? undefined
                              : {
                                  backgroundColor: `color-mix(in oklch, var(--color-primary) ${Math.round(25 + (count / max) * 75)}%, transparent)`,
                                }
                          }
                          title={`${day}: ${count} clock-in${count === 1 ? "" : "s"}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Separator className="my-4" />
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">On-time rate</span>
                <span className="font-medium text-success-strong">
                  {heatmap?.onTimeRate == null ? "—" : `${heatmap.onTimeRate.toFixed(1)}%`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Late arrivals (avg)</span>
                <span className="font-medium">
                  {heatmap?.lateArrivalsPerDay == null ? "—" : `${heatmap.lateArrivalsPerDay.toFixed(1)} / day`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Avg shift length</span>
                <span className="font-medium">
                  {heatmap?.avgShiftHours == null ? "—" : `${heatmap.avgShiftHours.toFixed(1)} h`}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
        </TabsContent>
        <TabsContent value="exceptions">
          <AttendanceExceptionsPanel onChanged={() => void reload()} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={(open) => !bulkBusy && setConfirmBulk(open)}
        title="Verify pending clock-ins?"
        description={
          `${bulkCount} pending clock-in${bulkCount === 1 ? "" : "s"} (across all pages) will be marked Verified.` +
          (skippedForReview > 0
            ? ` ${skippedForReview} with a geofence breach or failed photo are left for you to check one by one.`
            : "")
        }
        confirmLabel={bulkBusy ? "Verifying…" : "Verify all"}
        destructive={false}
        loading={bulkBusy}
        onConfirm={() => void runBulkVerify()}
      />

      <AttendanceVerificationDialog
        entry={reviewing}
        onOpenChange={(open) => !open && setReviewing(null)}
        onVerify={verify}
      />
    </div>
  );
}
