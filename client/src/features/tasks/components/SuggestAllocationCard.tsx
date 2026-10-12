import { useCallback, useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ProjectPicker } from "@/components/shared/project-picker";
import { DecisionSupportLabel } from "@/components/shared/decision-support-label";
import { recordDecisionSupport } from "@/features/decision-support/events.api";
import { tasksRepository, type AllocationProposal } from "../repositories/task.repository";

/**
 * "Suggest assignees for unassigned tasks": proposes an assignee for every
 * unassigned task on a project and lists them for review. Nothing is saved
 * until the person accepts an item, which uses the normal task update.
 */
export function SuggestAllocationCard({ onAccepted }: { onAccepted?: () => void }) {
  const [projectCode, setProjectCode] = useState("");
  const [proposal, setProposal] = useState<AllocationProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyTask, setBusyTask] = useState<number | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  const run = useCallback(async () => {
    if (!projectCode) return;
    setLoading(true);
    setError(null);
    setAccepted(new Set());
    setSkipped(new Set());
    try {
      const result = await tasksRepository.suggestAllocation(projectCode);
      setProposal(result);
      recordDecisionSupport(
        result.items
          .filter((i) => i.suggestions[0])
          .map((i) => ({ kind: "allocation" as const, itemKey: `${i.taskId}:${i.suggestions[0]!.userId}`, projectCode, action: "shown" as const })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load suggestions");
    } finally {
      setLoading(false);
    }
  }, [projectCode]);

  const accept = async (taskId: number, userId: number, name: string) => {
    setBusyTask(taskId);
    setError(null);
    try {
      await tasksRepository.update(taskId, { assignedToUserId: userId, assignedToName: name });
      recordDecisionSupport([{ kind: "allocation", itemKey: `${taskId}:${userId}`, projectCode, action: "accepted" }]);
      setAccepted((prev) => new Set(prev).add(taskId));
      onAccepted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't assign the task");
    } finally {
      setBusyTask(null);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Suggest assignees for unassigned tasks</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reviews every unassigned task on a project. You accept each suggestion one by one; nothing is assigned automatically.
            </p>
          </div>
          <DecisionSupportLabel basis={proposal?.basis} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label>Project</Label>
            <ProjectPicker value={projectCode} onChange={setProjectCode} className="w-full" />
          </div>
          <Button type="button" onClick={() => void run()} disabled={!projectCode || loading}>
            <Sparkles className="h-4 w-4" />
            {loading ? "Working…" : "Suggest assignees"}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive-strong">{error}</p>}

        {proposal && proposal.items.length === 0 && (
          <p className="text-sm text-muted-foreground">Every task on {proposal.projectCode} already has an assignee.</p>
        )}

        {proposal && proposal.items.length > 0 && (
          <ul className="divide-y divide-border/60 rounded-md border border-border/60">
            {proposal.items.map((item) => {
              const best = item.suggestions[0];
              return (
                <li key={item.taskId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 text-xs">
                    <div className="font-mono text-muted-foreground">
                      {item.taskCode}
                      {item.dueDate ? ` · due ${item.dueDate}` : ""}
                    </div>
                    <div className="text-sm font-medium">{item.title}</div>
                    {best ? (
                      <div className="mt-1 text-muted-foreground">
                        <span className="font-medium text-foreground">{best.name}</span>
                        {best.position ? ` (${best.position})` : ""}: {best.reasons.join("; ")}
                      </div>
                    ) : (
                      <div className="mt-1 text-muted-foreground">No eligible Site Personnel on this project.</div>
                    )}
                  </div>
                  {best &&
                    (accepted.has(item.taskId) ? (
                      <span className="text-xs text-success-strong">Assigned to {best.name}</span>
                    ) : skipped.has(item.taskId) ? (
                      <span className="text-xs text-muted-foreground">Skipped</span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={busyTask === item.taskId}
                          onClick={() => void accept(item.taskId, best.userId, best.name)}
                        >
                          {busyTask === item.taskId ? "Saving…" : `Assign ${best.name.split(" ")[0]}`}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() => {
                            recordDecisionSupport([{ kind: "allocation", itemKey: `${item.taskId}:${best.userId}`, projectCode, action: "dismissed" }]);
                            setSkipped((prev) => new Set(prev).add(item.taskId));
                          }}
                        >
                          Skip
                        </Button>
                      </div>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
        {proposal && <p className="text-overline text-muted-foreground">{proposal.basis}</p>}
      </CardContent>
    </Card>
  );
}
