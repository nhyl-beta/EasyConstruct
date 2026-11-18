// "Resolve flags": the clock-ins that need HR's decision (outside the site radius, failed photo, or already
// flagged), each with a Review button that opens the usual photo-and-location check.
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listAttendanceAll, type AttendanceEntry } from "@/features/hr/attendance-api";
import { listEmployees } from "@/features/hr/hr-api";

// Verifying and flagging both count as reviewed, so either one takes the clock-in off this list.
const needsReview = (e: AttendanceEntry) =>
  !e.reviewedAt && (e.status === "Flagged" || e.geofence === "Outside" || e.photo === "Failed");

export function ResolveFlagsDialog({ open, onOpenChange, onReview }: { open: boolean; onOpenChange: (open: boolean) => void; onReview: (entry: AttendanceEntry) => void }) {
  const [rows, setRows] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      const employees = await listEmployees();
      const names = new Map(employees.map((e) => [e.id, { name: e.name, initials: e.initials }]));
      const [pending, flagged] = await Promise.all([listAttendanceAll({ verification: "Pending" }, names), listAttendanceAll({ verification: "Flagged" }, names)]);
      if (active) setRows([...flagged, ...pending].filter(needsReview));
    })()
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : "Could not load the flagged clock-ins"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resolve flags</DialogTitle>
          <DialogDescription>Clock-ins outside the site radius or with a failed photo that HR has not reviewed yet. Verifying or flagging one takes it off this list.</DialogDescription>
        </DialogHeader>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p role="alert" className="text-sm text-destructive-strong">{error}</p>}
        {!loading && !error && rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing to resolve. No flagged clock-ins.</p>}
        <ul className="space-y-2">
          {rows.slice(0, 50).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.name || r.employeeId} <span className="text-xs font-normal text-muted-foreground">{r.logDate} · {r.site}</span></p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="rounded-full text-overline"><MapPin className="mr-1 h-3 w-3" />{r.geofence}{r.distanceFromSiteM != null ? ` · ${r.distanceFromSiteM} m` : ""}</Badge>
                  <Badge variant="outline" className="rounded-full text-overline">Photo: {r.photo}</Badge>
                  <Badge variant="outline" className="rounded-full text-overline">{r.status}</Badge>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); onReview(r); }}>Review</Button>
            </li>
          ))}
        </ul>
        {rows.length > 50 && <p className="text-xs text-muted-foreground">Showing the first 50 of {rows.length}. Resolve these, then open this again.</p>}
      </DialogContent>
    </Dialog>
  );
}
