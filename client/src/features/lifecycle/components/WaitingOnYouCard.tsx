// K1: cross-project "what's waiting on you" — the lifecycle gate checks and
// the workflow approval queue are both single-project or per-call-site;
// this is the one place a role sees everything at once, mirroring
// GET /api/lifecycle/my-actions.
import { AlertCircle, ChevronRight, ClipboardCheck, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { useEffect, useState } from "react";
import { recordDecisionSupport } from "@/features/decision-support/events.api";
import { useMyActions } from "../hooks/useMyActions";
import type { MyActionItem } from "../types/my-actions.types";

// ai-signals E3: a "signal" item is decision support, not a gate/workflow
// blocker — the icon and tone make that distinction visible at a glance
// even before reading the text.
function actionIcon(a: MyActionItem) {
  if (a.kind === "signal") {
    return (
      <Sparkles
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${a.severity === "critical" ? "text-destructive-strong" : "text-ai"}`}
      />
    );
  }
  return <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-strong" />;
}

export function WaitingOnYouCard() {
  const { actions, loading } = useMyActions();
  const navigate = useNavigate();
  // Fix 3.7: detected issues shown here, and the answer to "was this useful".
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const keyOf = (a: MyActionItem) => `${a.projectCode}|${a.title}`;
  useEffect(() => {
    recordDecisionSupport(
      actions
        .slice(0, 6)
        .filter((a) => a.kind === "signal")
        .map((a) => ({ kind: "finding" as const, itemKey: keyOf(a), projectCode: a.projectCode, action: "shown" as const })),
    );
  }, [actions]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-primary-strong" />
          Waiting on you
        </CardTitle>
        {actions.length > 0 && (
          <Badge variant="outline" className="rounded-full text-overline">
            {actions.length}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {loading && <p className="py-4 text-sm text-muted-foreground">Checking…</p>}
        {!loading && actions.length === 0 && (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            Nothing waiting on you right now.
          </p>
        )}
        {!loading &&
          actions.slice(0, 6).map((a, i) => (
            <button
              key={`${a.projectCode}-${a.kind}-${i}`}
              type="button"
              onClick={() => navigate(a.link)}
              className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted/50"
            >
              {actionIcon(a)}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="block text-sm font-medium leading-tight">{a.title}</span>
                  {a.kind === "signal" && (
                    <Badge variant="outline" className="rounded-full border-ai/30 text-[9px] text-ai">
                      Decision support
                    </Badge>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {a.projectName} · {a.detail}
                </span>
                {a.kind === "signal" && a.suggestedResolution && (
                  <span className="mt-0.5 block text-xs text-foreground/80">
                    Suggested: {a.suggestedResolution.action}
                    {a.suggestedResolution.precedents && a.suggestedResolution.precedents.length > 0 && (
                      <>
                        {" "}Similar resolved issue: {a.suggestedResolution.precedents[0]!.issueCode}, "
                        {a.suggestedResolution.precedents[0]!.resolutionNotes.slice(0, 120)}"
                      </>
                    )}
                  </span>
                )}
                {a.kind === "signal" && a.firstSeen && (
                  <span className="mt-0.5 block text-overline text-muted-foreground">
                    Open since {formatRelativeTime(a.firstSeen)}. A person decides what to do.
                  </span>
                )}
                {a.kind === "signal" && (
                  <span className="mt-1 flex items-center gap-2 text-overline text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                    {answered.has(keyOf(a)) ? (
                      <span>Thanks, noted.</span>
                    ) : (
                      <>
                        Was this useful?
                        {(["accepted", "dismissed"] as const).map((action) => (
                          <span
                            key={action}
                            role="button"
                            tabIndex={0}
                            className="underline underline-offset-2 hover:text-foreground"
                            onClick={() => {
                              recordDecisionSupport([{ kind: "finding", itemKey: keyOf(a), projectCode: a.projectCode, action }]);
                              setAnswered((prev) => new Set(prev).add(keyOf(a)));
                            }}
                            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLElement).click()}
                          >
                            {action === "accepted" ? "Yes" : "No"}
                          </span>
                        ))}
                      </>
                    )}
                  </span>
                )}
              </span>
              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          ))}
        {!loading && actions.length > 6 && (
          <p className="px-2 pt-1 text-xs text-muted-foreground">
            +{actions.length - 6} more
          </p>
        )}
      </CardContent>
    </Card>
  );
}

WaitingOnYouCard.displayName = "WaitingOnYouCard";
