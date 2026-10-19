import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DecisionSupportLabel } from "@/components/shared/decision-support-label";
import { useEffect } from "react";
import { recordDecisionSupport } from "@/features/decision-support/events.api";
import { useAssigneeSuggestions } from "../hooks/use-assignee-suggestions";
import type { AssignmentWarning } from "../repositories/task.repository";

/** Inline warnings about a chosen assignee (fix 2.2). Advice, never a block. */
export function AssignmentWarnings({ warnings }: { warnings: AssignmentWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-md border border-warning-strong/30 bg-warning-soft p-3 text-xs text-warning-strong">
      {warnings.map((w) => (
        <li key={w.code} className="flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{w.message}</span>
        </li>
      ))}
      <li className="text-muted-foreground">You can still assign this person. It is your call.</li>
    </ul>
  );
}

/**
 * Top suggested assignees for the task being drafted, with the reasons for
 * each. "Assign" only fills the form field; the person still presses Create.
 */
export function AssigneeSuggestionsPanel({
  projectCode,
  title,
  dueDate,
  milestoneId,
  selectedUserId,
  onAssign,
}: {
  projectCode: string;
  title: string;
  dueDate?: string;
  milestoneId?: number;
  selectedUserId: number | null;
  onAssign: (userId: number, name: string) => void;
}) {
  const { data, loading, error, ready } = useAssigneeSuggestions({ projectCode, title, dueDate, milestoneId });

  // Fix 3.7: what was shown, taken or dismissed. One key per project, task title and person.
  const keyFor = (userId: number) => `${projectCode}|${title.trim().toLowerCase().slice(0, 60)}|${userId}`;
  useEffect(() => {
    if (!data || data.suggestions.length === 0) return;
    recordDecisionSupport(data.suggestions.map((s) => ({ kind: "assignee", itemKey: keyFor(s.userId), projectCode, action: "shown" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!ready) {
    return (
      <p className="text-xs text-muted-foreground">
        Pick a project and type a title to see suggested assignees.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">Suggested assignees</h3>
        <DecisionSupportLabel basis={data?.basis} />
      </div>
      {loading && !data ? (
        <p className="text-xs text-muted-foreground">Looking at workload and attendance…</p>
      ) : error ? (
        <p className="text-xs text-destructive-strong">Couldn't load suggestions. {error}</p>
      ) : !data || data.suggestions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No eligible Site Personnel on this project. Staff someone first, or check that they have an active employee record.
        </p>
      ) : (
        <ol className="space-y-2">
          {data.suggestions.map((s, i) => (
            <li
              key={s.userId}
              className="flex flex-col gap-2 rounded-md bg-muted/40 p-2 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 text-xs">
                <div className="font-medium text-foreground">
                  {i + 1}. {s.name}
                  {s.position && <span className="ml-1.5 font-normal text-muted-foreground">{s.position}</span>}
                </div>
                <ul className="mt-0.5 list-disc pl-4 text-muted-foreground">
                  {s.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <Button
                type="button"
                size="sm"
                variant={selectedUserId === s.userId ? "secondary" : "outline"}
                className="h-7 shrink-0"
                onClick={() => {
                  recordDecisionSupport([{ kind: "assignee", itemKey: keyFor(s.userId), projectCode, action: "accepted" }]);
                  onAssign(s.userId, s.name);
                }}
              >
                {selectedUserId === s.userId ? "Selected" : "Assign"}
              </Button>
            </li>
          ))}
        </ol>
      )}
      {data && data.suggestions.length > 0 && (
        <button
          type="button"
          className="text-overline text-muted-foreground underline underline-offset-2"
          onClick={() =>
            recordDecisionSupport(data.suggestions.map((s) => ({ kind: "assignee", itemKey: keyFor(s.userId), projectCode, action: "dismissed" })))
          }
        >
          These suggestions are not helpful
        </button>
      )}
      {data && <p className="text-overline text-muted-foreground">{data.basis}</p>}
      {data && data.excluded.length > 0 && (
        <p className="text-overline text-muted-foreground">
          Left out: {data.excluded.map((e) => `${e.name} (${e.reason})`).join(", ")}
        </p>
      )}
    </div>
  );
}
