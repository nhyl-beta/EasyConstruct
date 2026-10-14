// How one payroll line was calculated (objectives fix 2.5): the steps, the
// attendance behind the hours, and the rate versions used. Read-only.
import { useEffect, useState } from "react";
import { Calculator } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getPayrollTrace, visibleRateVersions, type PayrollTrace } from "@/features/hr/payroll-api";
import { formatCurrency } from "@/lib/format-currency";

export function PayrollTraceButton({ lineId, onOpen }: { lineId: number; onOpen: (id: number) => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 gap-1 px-2 text-xs"
      aria-label="How this line was calculated"
      title="How this line was calculated"
      onClick={() => onOpen(lineId)}
    >
      <Calculator className="h-3.5 w-3.5" /> Trace
    </Button>
  );
}

export function PayrollTraceSheet({ lineId, onClose }: { lineId: number | null; onClose: () => void }) {
  const [trace, setTrace] = useState<PayrollTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lineId == null) return;
    let cancelled = false;
    setTrace(null);
    setError(null);
    setLoading(true);
    getPayrollTrace(lineId)
      .then((t) => !cancelled && setTrace(t))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load the calculation"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [lineId]);

  return (
    <Sheet open={lineId != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{trace ? `How ${trace.line.name}'s pay was calculated` : "Calculation"}</SheetTitle>
          <SheetDescription>
            {trace ? `${trace.line.empId} · ${trace.line.period}` : "Steps, attendance and rate versions behind this line."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6 text-sm">
          {loading && <p className="text-muted-foreground">Loading the calculation…</p>}
          {error && <p className="text-destructive-strong">Couldn't load the calculation. {error}</p>}

          {trace && (
            <>
              <section className="space-y-1">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Steps</h3>
                <ul className="divide-y rounded-lg border">
                  {trace.steps.map((s) => (
                    <li key={s.label} className="flex items-start justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="font-medium">{s.label}</div>
                        <div className="text-xs text-muted-foreground">{s.formula}</div>
                      </div>
                      <div className="shrink-0 tabular-nums">{s.amount != null ? formatCurrency(s.amount) : "-"}</div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Checked against today's inputs</h3>
                {trace.recomputed.matches ? (
                  <p className="text-success-strong">Recomputing with the same engine gives the same figures.</p>
                ) : (
                  <ul className="list-inside list-disc text-warning-strong">
                    {trace.recomputed.differences.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-1">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Attendance behind the hours</h3>
                <p className="text-xs text-muted-foreground">{trace.hoursNote}</p>
                {trace.attendance.length === 0 ? (
                  <p className="text-muted-foreground">No attendance records for this period.</p>
                ) : (
                  <div className="rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Date</th>
                          <th className="px-2 py-1.5 text-left">In / out</th>
                          <th className="px-2 py-1.5 text-right">Hours</th>
                          <th className="px-2 py-1.5 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trace.attendance.map((a) => (
                          <tr key={a.id} className="border-t">
                            <td className="px-2 py-1.5">{a.logDate}</td>
                            <td className="px-2 py-1.5 font-mono">
                              {a.clockIn} / {a.clockOut ?? "-"}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {a.hours}
                              {a.counted && a.overtime > 0 ? ` (${a.regular} + ${a.overtime} OT)` : ""}
                            </td>
                            <td className="px-2 py-1.5">
                              <Badge variant={a.counted ? "success" : "warning"} className="text-overline">
                                {a.counted ? "Counted" : a.verification}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="space-y-1">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Rate versions used</h3>
                <p className="text-xs text-muted-foreground">
                  {trace.rateVersions
                    ? visibleRateVersions(trace.rateVersions)
                        .map(([k, v]) => `${k} ${v}`)
                        .join(" · ")
                    : "No rate versions were recorded for this line."}
                </p>
              </section>

              <p className="text-overline text-muted-foreground">{trace.notCertified}</p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
