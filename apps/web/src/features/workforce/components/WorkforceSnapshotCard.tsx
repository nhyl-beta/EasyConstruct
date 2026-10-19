// Part C3: admin-dashboard.tsx's "Workforce snapshot" was a ComingSoonCard.
// A real cross-project workforce summary, from the same data path E3 wires
// hr-dashboard.tsx's WorkforceSection to (useWorkforceSnapshot).
import { Users } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkforceSnapshot } from "@/features/workforce/hooks/useWorkforceSnapshot";

export function WorkforceSnapshotCard() {
  const w = useWorkforceSnapshot();
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary-strong" />
          Workforce snapshot
        </CardTitle>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate("/workforce-reports")}>
          Workforce Reports
        </Button>
      </CardHeader>
      <CardContent>
        {w.loading ? (
          <p className="py-2 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Active capacity" value={w.totalCapacity} />
            <Stat label={`Assigned (${w.windowDays}d)`} value={w.assignedRecently} />
            <Stat label="Available" value={w.available} />
            <Stat label={`OT crews (${w.windowDays}d)`} value={w.overtimeCrews} />
          </div>
        )}
        <p className="mt-3 text-overline text-muted-foreground">
          From {w.totalEmployees} real employee records and their real attendance rows —
          "assigned" and "OT crews" are counted over the last {w.windowDays} days, not "today"
          (this sandbox's seeded demo attendance is dated in the future, in-project), so a real,
          near-empty window is expected and shown honestly rather than padded.
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-overline text-muted-foreground">{label}</div>
    </div>
  );
}

WorkforceSnapshotCard.displayName = "WorkforceSnapshotCard";
