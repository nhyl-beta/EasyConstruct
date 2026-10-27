import { useState } from "react";
import { CheckCircle2, Flag } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { STATUS_TONES } from "@/config/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useEngineerMilestones } from "../hooks/use-engineer-milestones";
import type { Milestone } from "../repositories/milestone.repository";

const STATUS_TONE: Record<string, string> = {
  active: STATUS_TONES.success,
  "at-risk": STATUS_TONES.warning,
  completed: STATUS_TONES.neutral,
};

/** Engineer Progress page: milestones on assigned projects, with "Mark completed". */
export function EngineerMilestonesCard() {
  const { open, completed, loading, error, completingId, completeError, clearCompleteError, complete } =
    useEngineerMilestones();
  const [confirming, setConfirming] = useState<Milestone | null>(null);

  const confirm = async () => {
    if (!confirming) return;
    const result = await complete(confirming.id);
    if (result.ok) toast.success(`"${confirming.title}" marked completed`);
    else toast.error(result.message);
    setConfirming(null);
  };

  const row = (m: Milestone, muted: boolean) => (
    <div key={m.id} className={`flex flex-wrap items-center justify-between gap-3 p-4 ${muted ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          {muted ? <CheckCircle2 className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{m.title}</div>
          <div className="text-xs text-muted-foreground">
            {m.projectCode} · est. {m.estimatedCompletionDate ?? "no date set"}
            {m.status === "completed" && m.completedBy
              ? ` · completed by ${m.completedBy}${m.completedAt ? ` on ${m.completedAt.slice(0, 10)}` : ""}`
              : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`rounded-full px-2.5 py-0.5 text-overline font-medium ${STATUS_TONE[m.status] ?? ""}`}>
          {m.status}
        </Badge>
        {!muted && (
          <Button
            size="sm"
            className="h-8"
            disabled={completingId === m.id}
            onClick={() => {
              clearCompleteError();
              setConfirming(m);
            }}
          >
            {completingId === m.id ? "Saving…" : "Mark completed"}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Milestones</CardTitle>
        <p className="text-xs text-muted-foreground">
          Active and at-risk milestones on your assigned projects. Marking one completed notifies the Project Manager.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {completeError && (
          <p role="alert" className="mx-4 mb-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-strong">
            {completeError}
          </p>
        )}
        {loading ? (
          <div className="p-5 text-sm text-muted-foreground">Loading milestones…</div>
        ) : error ? (
          <div className="p-5 text-sm text-destructive-strong">Could not load milestones. {error}</div>
        ) : open.length === 0 && completed.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">No milestones on your assigned projects yet.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {open.length === 0 && (
              <div className="p-5 text-sm text-muted-foreground">No active milestones to complete.</div>
            )}
            {open.map((m) => row(m, false))}
            {completed.map((m) => row(m, true))}
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(next) => !next && setConfirming(null)}
        title="Mark milestone completed?"
        description={
          confirming
            ? `"${confirming.title}" on ${confirming.projectCode} will be marked completed and the Project Manager will be notified.`
            : undefined
        }
        confirmLabel="Mark completed"
        destructive={false}
        loading={completingId !== null}
        onConfirm={() => void confirm()}
      />
    </Card>
  );
}
