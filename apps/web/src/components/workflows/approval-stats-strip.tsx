// The four approval status cards (Pending / Overdue / Avg cycle / This week). Shown at the top of the /approvals
// page, above the requirements and purchasing sections; ApprovalQueuePanel renders the same cards itself (through
// ApprovalStatCards) where it is the first thing on the page (Admin workflow oversight, Consultant proposals).
//
// Both read the one stats query (qk.approvals.stats), so they share a single request and refresh together after a
// decision.
import { Card, CardContent } from "@/components/ui/card";
import { useApprovalStats } from "@/features/workflows/hooks/useWorkflows";
import type { ApprovalStats } from "@/features/workflows/types/workflow.types";

/** The cards for a loaded set of stats, or neutral placeholders while `stats` is null. */
export function ApprovalStatCards({ stats }: { stats: ApprovalStats | null }) {
  const cards = [
    { label: "Pending", value: stats ? `${stats.pending}` : "–", tone: "text-foreground" },
    {
      label: "Overdue",
      value: stats ? `${stats.overdue}` : "–",
      tone: stats && stats.overdue > 0 ? "text-destructive-strong" : "text-foreground",
    },
    { label: "Avg cycle", value: stats ? `${stats.avgCycleDays}d` : "–", tone: "text-foreground" },
    { label: "This week", value: stats ? `${stats.thisWeek}` : "–", tone: "text-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((s) => (
        <Card key={s.label}>
          <CardContent className="space-y-1 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className={`text-2xl font-semibold tabular-nums ${s.tone}`}>{s.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ApprovalStatsStrip() {
  const { stats, loading, failed } = useApprovalStats();
  // A failed stats call hides the strip quietly; the queue below still works.
  if (failed) return null;
  return <ApprovalStatCards stats={loading ? null : stats} />;
}
