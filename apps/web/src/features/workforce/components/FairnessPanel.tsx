// Fairness report (objectives fix 2.6). Hours, overtime and task counts per
// worker per project, and pay rates against the median of the same position.
// Read-only: flags are for HR to look at and change nothing.
import { DEFAULT_PAGE_SIZE } from "@/config/pagination";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DecisionSupportLabel } from "@/components/shared/decision-support-label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format-currency";
import { getFairness, type FairnessFlagKind, type FairnessPage } from "../fairness-api";

const PAGE_SIZE = DEFAULT_PAGE_SIZE;
const FLAG_LABEL: Record<FairnessFlagKind, string> = {
  hours_high: "Hours high",
  hours_low: "Hours low",
  overtime_high: "Overtime high",
  tasks_high: "Tasks high",
  rate_outlier: "Pay rate",
};

export function FairnessPanel({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FairnessPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPage(1), [dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFairness({ page, pageSize: PAGE_SIZE, dateFrom, dateTo })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load the fairness report"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, dateFrom, dateTo]);

  if (loading && !data) return <p className="text-sm text-muted-foreground">Working out the fairness report…</p>;
  if (error) return <p className="text-sm text-destructive-strong">Couldn't load the fairness report. {error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Things to look at</CardTitle>
            <DecisionSupportLabel />
          </div>
          <p className="text-xs text-muted-foreground">{data.basis}</p>
        </CardHeader>
        <CardContent>
          {data.flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing stands out in this period.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.flags.map((f, i) => (
                <li key={`${f.kind}-${f.employeeId}-${f.projectCode ?? ""}-${i}`} className="flex items-start gap-2 text-sm">
                  <Badge variant="outline" className="mt-0.5 shrink-0 rounded-full text-overline">
                    {FLAG_LABEL[f.kind]}
                  </Badge>
                  <span>{f.message}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pay rate by position</CardTitle>
          <p className="text-xs text-muted-foreground">Positions with at least three people on the same rate type.</p>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Position</TableHead>
                <TableHead>Rate type</TableHead>
                <TableHead className="text-right">People</TableHead>
                <TableHead className="text-right">Lowest</TableHead>
                <TableHead className="text-right">Median</TableHead>
                <TableHead className="text-right">Highest</TableHead>
                <TableHead className="text-right">Outliers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.positions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    Not enough people in any one position to compare.
                  </TableCell>
                </TableRow>
              )}
              {data.positions.map((p) => (
                <TableRow key={`${p.position}-${p.rateType}`}>
                  <TableCell className="text-sm">{p.position}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.rateType}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{p.people}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatCurrency(p.min)}</TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums">{formatCurrency(p.median)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatCurrency(p.max)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{p.outliers.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hours, overtime and tasks per worker</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Overtime</TableHead>
                <TableHead className="text-right">Tasks</TableHead>
                <TableHead className="text-right">Done</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                    No attendance or tasks in this period.
                  </TableCell>
                </TableRow>
              )}
              {data.items.map((r) => (
                <TableRow key={`${r.employeeId}-${r.projectCode}`}>
                  <TableCell>
                    <div className="text-sm font-medium">{r.name}</div>
                    <div className="text-overline text-muted-foreground">{r.position}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.projectCode}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{r.days}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{r.hours.toFixed(1)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{r.overtimeHours.toFixed(1)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{r.tasksAssigned}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{r.tasksCompleted}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{r.tasksOpen}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.total > 0 && (
            <div className="flex items-center justify-between gap-2 border-t px-4 pt-3 text-xs text-muted-foreground">
              <span>{data.total} worker-project rows</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums">
                  Page {page} of {data.pages}
                </span>
                <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= data.pages} onClick={() => setPage(page + 1)} aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
