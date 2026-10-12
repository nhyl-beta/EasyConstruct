// Suggested plan on an approved proposal (objectives fix 3.1). Draft milestones,
// tasks and a responsibilities checklist the Project Manager accepts or discards
// item by item. Nothing is applied until a person accepts it.
import { useState } from "react";
import { Check, ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DecisionSupportLabel } from "@/components/shared/decision-support-label";
import { usePlanSuggestions } from "../hooks/use-plan-suggestions";
import type { PlanItem, PlanSuggestion } from "../repositories/plan-suggestion.repository";

const str = (v: unknown) => (typeof v === "string" ? v : "");

function ItemActions({
  suggestion,
  item,
  canAct,
  busy,
  onAccept,
  onDiscard,
}: {
  suggestion: PlanSuggestion;
  item: PlanItem;
  canAct: boolean;
  busy: boolean;
  onAccept: (assignedToUserId?: number) => void;
  onDiscard: () => void;
}) {
  if (item.state === "accepted") {
    return (
      <Badge variant="success">
        <Check /> Accepted{item.createdRef ? ` (${item.createdRef.replace(":", " #")})` : ""}
      </Badge>
    );
  }
  if (item.state === "discarded") return <Badge variant="outline">Discarded</Badge>;
  if (!canAct) return null;
  const top = item.suggestedAssignees[0];
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => onAccept()}>
        Accept
      </Button>
      {item.kind === "task" && top && (
        <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => onAccept(top.userId)}>
          Accept and assign {top.name.split(" ")[0]}
        </Button>
      )}
      <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={onDiscard} aria-label={`Discard from plan ${suggestion.id}`}>
        <X className="h-3.5 w-3.5" /> Discard
      </Button>
    </div>
  );
}

function PlanBody({
  suggestion,
  canAct,
  busyItem,
  accept,
  discard,
}: {
  suggestion: PlanSuggestion;
  canAct: boolean;
  busyItem: number | null;
  accept: (s: number, item: number, assignedToUserId?: number) => Promise<void>;
  discard: (s: number, item: number) => Promise<void>;
}) {
  const [showResp, setShowResp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const live = suggestion.items.filter((i) => i.state !== "discarded");
  const discarded = suggestion.items.filter((i) => i.state === "discarded");
  const milestones = live.filter((i) => i.kind === "milestone");
  const tasks = live.filter((i) => i.kind === "task");
  const responsibilities = live.filter((i) => i.kind === "responsibility");
  const act = (item: PlanItem) => (
    <ItemActions
      suggestion={suggestion}
      item={item}
      canAct={canAct}
      busy={busyItem === item.id}
      onAccept={(uid) => void accept(suggestion.id, item.id, uid)}
      onDiscard={() => void discard(suggestion.id, item.id)}
    />
  );

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {milestones.map((m) => (
          <li key={m.id} className="rounded-md border border-border/60 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 text-sm">
                <div className="font-medium">{str(m.payload.title)}</div>
                <div className="text-xs text-muted-foreground">
                  {str(m.payload.startDate)} to {str(m.payload.estimatedCompletionDate)} · {String(m.payload.durationDays)} days
                </div>
                <div className="mt-0.5 text-overline text-muted-foreground">{m.payload.basis}</div>
              </div>
              {act(m)}
            </div>
            <ul className="mt-2 space-y-2 border-l border-border/60 pl-3">
              {tasks
                .filter((t) => t.payload.milestoneKey === m.payload.key)
                .map((t) => (
                  <li key={t.id} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 text-xs">
                      <div className="font-medium text-foreground">{str(t.payload.title)}</div>
                      <div className="text-muted-foreground">
                        Due {str(t.payload.dueDate)} · {str(t.payload.priority)} priority
                      </div>
                      {t.suggestedAssignees[0] && (
                        <div className="text-muted-foreground">
                          Suggested: {t.suggestedAssignees[0].name} ({t.suggestedAssignees[0].reasons.slice(0, 2).join("; ")})
                        </div>
                      )}
                      <div className="text-overline text-muted-foreground">{t.payload.basis}</div>
                    </div>
                    {act(t)}
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>

      {responsibilities.length > 0 && (
        <div className="rounded-md border border-border/60">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 p-3 text-left text-sm font-medium"
            onClick={() => setShowResp((v) => !v)}
          >
            {showResp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Responsibilities checklist ({responsibilities.length})
          </button>
          {showResp && (
            <ul className="divide-y divide-border/60 border-t border-border/60">
              {responsibilities.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 text-xs">
                    <div>
                      <span className="font-medium text-foreground">{str(r.payload.roleLabel)}</span>{" "}
                      <span className="text-muted-foreground">in {str(r.payload.phase)}</span>
                    </div>
                    <div className="text-muted-foreground">{str(r.payload.duty)}</div>
                  </div>
                  {act(r)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {discarded.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Hide" : "Show"} {discarded.length} discarded item{discarded.length === 1 ? "" : "s"}
          </button>
          {showHistory && (
            <ul className="mt-1 list-disc pl-5">
              {discarded.map((d) => (
                <li key={d.id}>
                  {str(d.payload.title) || `${str(d.payload.roleLabel)}: ${str(d.payload.duty)}`}
                  {d.decidedBy ? ` (by ${d.decidedBy})` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function SuggestedPlanPanel({ projectCode, canAct }: { projectCode: string; canAct: boolean }) {
  const { suggestions, loading, error, actionError, busyItem, accept, discard, regenerate } = usePlanSuggestions(projectCode);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Suggested plan</CardTitle>
          <DecisionSupportLabel />
        </div>
        <p className="text-xs text-muted-foreground">
          A draft plan built when a proposal is approved. Accepting a milestone adds it as a draft for you to activate later; nothing is applied until you accept it.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading the suggested plan…</p>
        ) : error ? (
          <p className="text-sm text-destructive-strong">Couldn't load the suggested plan. {error}</p>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No suggested plan yet. One is drafted automatically once a proposal for this project is approved.
          </p>
        ) : (
          suggestions.map((s) => (
            <div key={s.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Proposal #{s.proposalId}</span> · {s.counts.pending} pending,{" "}
                  {s.counts.accepted} accepted, {s.counts.discarded} discarded
                  <div className="mt-0.5">Basis: {s.basis}</div>
                </div>
                {canAct && (
                  <Button size="sm" variant="outline" className="h-7" disabled={busyItem === -s.id} onClick={() => void regenerate(s.id)}>
                    <RefreshCw className="h-3.5 w-3.5" /> {busyItem === -s.id ? "Working…" : "Regenerate"}
                  </Button>
                )}
              </div>
              <PlanBody suggestion={s} canAct={canAct} busyItem={busyItem} accept={accept} discard={discard} />
            </div>
          ))
        )}
        {actionError && <p className="text-sm text-destructive-strong">{actionError}</p>}
      </CardContent>
    </Card>
  );
}
