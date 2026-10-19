import { useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, Clock, History, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/auth/auth-context";
import { useProjectLifecycle } from "../hooks/useProjectLifecycle";
import { SEQUENCED_PHASES } from "../types/lifecycle.types";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { CloseoutSummaryCard } from "./CloseoutSummaryCard";
import { DecisionSupportSection } from "./DecisionSupportSection";
import { FEATURES } from "@/config/features";

const TONE_CLASS: Record<string, string> = {
  Proposal: "border-border text-foreground",
  Design: "border-border text-foreground",
  "Pre-Construction": "border-border text-foreground",
  Construction: "border-border text-foreground",
  Closeout: "border-border text-foreground",
  Completed: "border-success/30 bg-success/10 text-success-strong",
  Archived: "border-success/30 bg-success/10 text-success-strong",
  "On Hold": "border-warning/30 bg-warning/10 text-warning-strong",
  Cancelled: "border-destructive/30 bg-destructive/10 text-destructive-strong",
};

type ReasonAction = "hold" | "cancel" | "override";

export function ProjectLifecyclePanel({
  projectId,
  projectCode,
}: {
  projectId: string | number;
  /** C1: needed by CloseoutSummaryCard's "Start Project Closeout workflow"
   * action — CreateWorkflowInput keys off the project's code, not its
   * numeric id, and nothing else this panel already has resolves one to
   * the other client-side (the id→code lookup happens server-side only). */
  projectCode?: string;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isPm = user?.role === "project-manager";
  const canManage = isAdmin || isPm;

  const {
    view,
    loading,
    error,
    acting,
    actionError,
    reload,
    advance,
    hold,
    resume,
    cancel,
    archive,
  } = useProjectLifecycle(projectId);

  const [reasonDialog, setReasonDialog] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState("");

  const closeReasonDialog = () => {
    setReasonDialog(null);
    setReason("");
  };

  const submitReason = async () => {
    if (reasonDialog === "hold") {
      if (await hold(reason)) closeReasonDialog();
    } else if (reasonDialog === "cancel") {
      if (await cancel(reason)) closeReasonDialog();
    } else if (reasonDialog === "override") {
      if (await advance({ override: true, reason })) closeReasonDialog();
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading lifecycle status…
      </div>
    );
  }
  if (error || !view) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive-strong">
        {error ?? "Lifecycle status is unavailable."}
      </div>
    );
  }

  // The path comes from the server so a Design project shows its own phases
  // (no Pre-Construction / Construction, and Closeout reads "Turnover").
  const path = view.phasePath ?? SEQUENCED_PHASES.map((p) => ({ phase: p, label: p }));
  const labelOf = (phase: string) => path.find((p) => p.phase === phase)?.label ?? phase;
  const stepIndex = path.findIndex((p) => p.phase === view.phase);
  const isDesignProject = view.deliveryType === "Design";
  const isFrozen = view.phase === "On Hold" || view.phase === "Cancelled";

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={`rounded-full px-3 py-1 text-sm ${TONE_CLASS[view.phase] ?? ""}`}>
            {labelOf(view.phase)}
          </Badge>
          {view.planSets && view.planSets.total > 0 && (
            <span className="text-xs text-muted-foreground">
              {view.planSets.total} plan set{view.planSets.total === 1 ? "" : "s"} · {view.planSets.averagePoints}% delivered
            </span>
          )}
          {view.constructionTasks && (
            <span className="text-xs text-muted-foreground">
              {view.constructionTasks.done} of {view.constructionTasks.total} tasks done
            </span>
          )}
        </div>

        {canManage && !isFrozen && (
          <div className="flex items-center gap-2">
            {view.nextPhase && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                     
                      disabled={acting || !view.canAdvance}
                      onClick={() => void advance()}
                    >
                      Advance to {labelOf(view.nextPhase)}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!view.canAdvance && (
                  <TooltipContent>
                    {view.checks.filter((c) => !c.passed).length > 0
                      ? `Blocked: ${view.checks
                          .filter((c) => !c.passed)
                          .map((c) => c.key)
                          .join(", ")}`
                      : view.blockedReason ?? "Advance is not available"}
                  </TooltipContent>
                )}
              </Tooltip>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isAdmin && view.nextPhase && !view.canAdvance && (
                  <DropdownMenuItem onClick={() => setReasonDialog("override")}>
                    Override & advance
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  disabled={!["Design", "Pre-Construction", "Construction"].includes(view.phase)}
                  onClick={() => setReasonDialog("hold")}
                >
                  Put on hold
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!["Proposal"].includes(view.phase) && !isAdmin}
                  onClick={() => setReasonDialog("cancel")}
                >
                  Cancel project
                </DropdownMenuItem>
                {/* D6: surfaced once a proposal's approval workflow came back
                    rejected — same /cancel action, pre-filled reason. */}
                {view.phase === "Proposal" && view.hasRejectedProposal && (
                  <DropdownMenuItem
                    onClick={() => {
                      setReason("Bid lost — proposal was rejected.");
                      setReasonDialog("cancel");
                    }}
                  >
                    Mark bid lost
                  </DropdownMenuItem>
                )}
                {isAdmin && view.phase === "Completed" && (
                  <DropdownMenuItem onClick={() => void archive()}>Archive</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {canManage && view.phase === "On Hold" && (
          <Button size="sm" disabled={acting} onClick={() => void resume()}>
            Resume
          </Button>
        )}
      </div>

      {actionError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive-strong">
          {actionError.message}
        </p>
      )}

      {isFrozen ? (
        <p className="text-sm text-muted-foreground">
          {view.phase === "On Hold" ? "This project is on hold." : "This project is cancelled."}
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{view.progress}%</span>
            </div>
            <Progress value={view.progress} className="h-2" />
          </div>

          {/* Phase stepper */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {path.map(({ phase, label }, i) => (
              <span
                key={phase}
                className={`rounded-full border px-2.5 py-1 ${
                  i < stepIndex
                    ? "border-success/30 bg-success/10 text-success-strong"
                    : i === stepIndex
                      ? "border-primary/40 bg-primary/10 text-primary-strong"
                      : "border-border text-muted-foreground"
                }`}
              >
                {label}
              </span>
            ))}
          </div>

          {view.checks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Checks for {labelOf(view.phase)}
              </p>
              <ul className="space-y-1.5">
                {view.checks.map((check) => (
                  <li
                    key={check.key}
                    className="flex items-start gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    {check.passed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-strong" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive-strong" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{check.label}</span>
                        <span className="font-mono text-overline text-muted-foreground">{check.key}</span>
                        {check.ownerRoles.map((role) => (
                          <Badge key={role} variant="outline" className="rounded-full text-overline capitalize">
                            {role.replace(/-/g, " ")}
                          </Badge>
                        ))}
                      </div>
                      {check.detail && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{check.detail}</p>
                      )}
                      {/* B2: gates.ts has always carried a .link per check
                          ("/designs", "/blueprints", ...) that nothing ever
                          rendered — a failing check gave no indication of
                          where to go fix it. Same "Go to {route}" link/text
                          style as DecisionSupportSection's signal rows, and
                          only shown to a viewer who can actually act on it
                          (this check's own ownerRoles, or admin). */}
                      {!check.passed &&
                        check.link &&
                        (isAdmin || (user?.role && check.ownerRoles.includes(user.role))) && (
                          <Link
                            to={check.link}
                            className="mt-1 inline-block text-xs font-medium text-primary-strong hover:underline"
                          >
                            Go to {check.link.replace(/^\//, "")}
                          </Link>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* ai-signals E2: beneath the gate checklist, visibly separate from
          it — its own card, never inside the checks list above. */}
      {FEATURES.ai && view.signals && <DecisionSupportSection signals={view.signals} />}

      {/* H6/K2: everything Closeout cares about (documents, budgets, payroll,
          the closeout workflow) in one place, rather than four screens —
          also shown once Completed, so the record stays visible afterward. */}
      {!isDesignProject && (view.phase === "Closeout" || view.phase === "Completed") && (
        <CloseoutSummaryCard projectId={projectId} projectCode={projectCode} onWorkflowStarted={reload} />
      )}

      {view.history.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" /> History
          </p>
          <ul className="space-y-1.5">
            {[...view.history].reverse().map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                <span>
                  {h.fromStatus} → {h.toStatus} by {h.changedBy}
                  {h.reason ? ` — ${h.reason}` : ""}
                  {h.override ? " (override)" : ""} · {formatRelativeTime(h.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={reasonDialog !== null} onOpenChange={(open) => !open && closeReasonDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reasonDialog === "hold"
                ? "Put project on hold"
                : reasonDialog === "cancel"
                  ? "Cancel project"
                  : "Override blocked advance"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              reasonDialog === "override"
                ? "Reason for overriding the blocked checks (min. 10 characters)…"
                : "Reason…"
            }
            className="min-h-24"
          />
          {actionError && (
            <p className="text-sm text-destructive-strong">{actionError.message}</p>
          )}
          <DialogFooter>
            <Button
              disabled={
                acting ||
                !reason.trim() ||
                (reasonDialog === "override" && reason.trim().length < 10)
              }
              onClick={() => void submitReason()}
            >
              {acting ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

ProjectLifecyclePanel.displayName = "ProjectLifecyclePanel";
