// Part C1: pm-dashboard.tsx's "Awaiting your approval" card claimed "No
// approvals backend exists yet" — false. GET /workflows/approvals(?scope=
// pending) + /workflows/approvals/stats are real, already used by
// ApprovalQueuePanel (pm-approvals.tsx, admin-workflows.tsx). This is a
// compact read-only summary of the same real data — not a second query
// path — that links into the full queue for the actual decision UI.
import { ClipboardCheck, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApprovals } from "@/features/workflows/hooks/useWorkflows";

export function AwaitingApprovalCard() {
  const { items, stats, loading } = useApprovals("pending", 5);
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-primary-strong" />
          Awaiting your approval
        </CardTitle>
        {stats && stats.pending > 0 && (
          <Badge variant="outline" className="rounded-full text-overline">
            {stats.pending}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {loading && <p className="py-4 text-sm text-muted-foreground">Checking…</p>}
        {!loading && items.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            Nothing pending your decision right now.
          </p>
        )}
        {!loading &&
          items.slice(0, 5).map((item) => (
            <button
              key={item.stageId}
              type="button"
              onClick={() => navigate("/approvals")}
              className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted/50"
            >
              <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium leading-tight">
                  {item.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {item.projectCode}
                  {item.amount ? ` · ${item.amount}` : ""} · {item.type ?? "Workflow"}
                </span>
              </span>
              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          ))}
        {!loading && items.length > 5 && (
          <button
            type="button"
            onClick={() => navigate("/approvals")}
            className="w-full px-2 pt-1 text-left text-xs text-primary-strong hover:underline"
          >
            +{items.length - 5} more — view all approvals
          </button>
        )}
      </CardContent>
    </Card>
  );
}

AwaitingApprovalCard.displayName = "AwaitingApprovalCard";
