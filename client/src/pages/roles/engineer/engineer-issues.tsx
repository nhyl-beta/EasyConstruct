import { DecisionSupportLabel } from "@/components/shared/decision-support-label";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, ShieldAlert, Sparkles } from "lucide-react";
import { FEATURES } from "@/config/features";
import { issuesRepository, type SimilarResolvedIssue } from "@/features/issues/repositories/issues.repository";
import { ReportIssueDialog } from "@/features/issues/components/ReportIssueDialog";
import { useStaffedProjectCodes } from "@/features/project-members/hooks/use-staffed-project-codes";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { Card, CardContent } from "@/components/ui/card";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useIssues } from "@/features/issues/hooks/use-issues";
import { useAuth } from "@/auth/auth-context";
import type { IssueRecord, UpdateIssueStatusInput } from "@/features/issues/repositories/issues.repository";

const STATUS_OPTIONS: UpdateIssueStatusInput["status"][] = [
  "Submitted",
  "Under Review",
  "Resolved",
  "Rejected",
];

function trim(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function IssueRow({
  issue,
  updating,
  updateError,
  onEdit,
  onUpdate,
}: {
  issue: IssueRecord;
  updating: boolean;
  /** Why the last update to THIS issue failed — shown under it, nowhere else. */
  updateError?: string;
  onEdit: () => void;
  onUpdate: (status: UpdateIssueStatusInput["status"], resolutionNotes?: string) => void;
}) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<UpdateIssueStatusInput["status"]>(
    issue.status as UpdateIssueStatusInput["status"],
  );
  const [notes, setNotes] = useState("");
  const dirty = nextStatus !== issue.status;
  const isOpen = issue.status === "Submitted" || issue.status === "Under Review";

  // B2: similarity-ranked precedents for THIS issue. The server returns [] when
  // the AI flag is off or nothing clears the similarity floor, so no box
  // appears unless there is a real match.
  const [precedents, setPrecedents] = useState<SimilarResolvedIssue[]>([]);
  useEffect(() => {
    if (!FEATURES.ai || !isOpen) {
      setPrecedents([]);
      return;
    }
    let cancelled = false;
    issuesRepository
      .precedentsForIssue(issue.id)
      .then((res) => {
        if (!cancelled) setPrecedents(res.data);
      })
      .catch(() => {
        if (!cancelled) setPrecedents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [issue.id, isOpen]);

  return (
    <div className="space-y-3 border-b border-border p-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted-foreground">
            {issue.issueCode} · {issue.projectCode}
          </div>
          <div className="truncate text-sm font-medium">{issue.title}</div>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{issue.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={issue.severity} />
          <StatusBadge status={issue.status} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={nextStatus}
          onValueChange={(v) => {
            setNextStatus(v as UpdateIssueStatusInput["status"]);
            setLocalError(null);
            onEdit();
          }}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {dirty && (nextStatus === "Resolved" || nextStatus === "Rejected") && (
          <Textarea
            className="h-8 min-h-8 flex-1 text-xs"
            placeholder="Resolution notes…"
            value={notes}
            aria-invalid={!!(localError || updateError)}
            onChange={(e) => {
              setNotes(e.target.value);
              setLocalError(null);
              onEdit();
            }}
          />
        )}

        <Button
          size="sm"
          className="h-8"
          disabled={!dirty || updating}
          onClick={() => {
            // Resolving needs notes; say so here instead of sending a request
            // that is bound to be refused.
            if (nextStatus === "Resolved" && !notes.trim()) {
              setLocalError("Resolution notes are required to resolve an issue.");
              return;
            }
            setLocalError(null);
            onUpdate(nextStatus, notes.trim() || undefined);
          }}
        >
          {updating ? "Saving…" : "Update status"}
        </Button>
      </div>

      {(localError || updateError) && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-strong">
          {localError ?? updateError}
        </p>
      )}

      {issue.status === "Resolved" && issue.siteContext && (
        <p className="text-xs text-muted-foreground">Location: {issue.siteContext}</p>
      )}

      {/* B2: decision support only — never changes what status this issue
          can be moved to, and never fills the notes by itself. */}
      {FEATURES.ai && isOpen && precedents.length > 0 && (
        <div className="rounded-lg border border-ai/20 bg-ai-soft/30 p-2.5 text-xs">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Sparkles className="h-3 w-3 text-ai" />
            Similar issue resolved before
            <DecisionSupportLabel className="ml-auto" />
          </p>
          <ul className="mt-1 space-y-2 text-muted-foreground">
            {precedents.map((p) => (
              <li key={p.issueCode}>
                <div className="font-mono text-overline">
                  {p.issueCode} · {p.projectCode}
                  {p.resolvedAt ? ` · ${p.resolvedAt.slice(0, 10)}` : ""} · {Math.round(p.score * 100)}% match
                </div>
                <div>
                  "{p.title}": {trim(p.resolutionNotes, 200)}
                </div>
                {dirty && nextStatus === "Resolved" && (
                  <button
                    type="button"
                    className="mt-0.5 text-primary-strong hover:underline"
                    onClick={() => {
                      setNotes(p.resolutionNotes);
                      setLocalError(null);
                      onEdit();
                    }}
                  >
                    Use as starting point
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function IssuesPage() {
  const { user } = useAuth();
  const { issues, loading, error, updating, updateErrors, clearUpdateError, updateStatus, refresh, counts, pagination } = useIssues();
  const isPm = user?.role === "project-manager";
  const isEngineer = user?.role === "engineer";
  const { codes: staffedCodes } = useStaffedProjectCodes("engineer");

  const openCount = counts.submitted;
  const underReviewCount = counts.underReview;
  const criticalCount = counts.critical;
  const resolvedCount = counts.resolved;

  return (
    <PageContainer>
      <PageHeader
        title={isPm ? "Issue review" : "Issues"}
        description={
          isPm
            ? "Review issues reported on your projects and record their resolution"
            : "Review issues reported from the field and record their resolution"
        }
        actions={isEngineer ? <ReportIssueDialog staffedCodes={staffedCodes} onReported={refresh} /> : undefined}
      />
      <PageContent className="space-y-6 p-6 md:p-8">
        <KpiStrip
          items={[
            { label: "Submitted", value: loading ? "…" : `${openCount}`, icon: AlertTriangle, tone: openCount > 0 ? "warn" : "neutral" },
            { label: "Under review", value: loading ? "…" : `${underReviewCount}`, icon: Clock },
            { label: "Critical", value: loading ? "…" : `${criticalCount}`, icon: ShieldAlert, tone: criticalCount > 0 ? "bad" : "neutral" },
            { label: "Resolved", value: loading ? "…" : `${resolvedCount}`, icon: CheckCircle2, tone: "good" },
          ]}
        />

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-5 text-sm text-muted-foreground">Loading issues…</div>
            ) : error && issues.length === 0 ? (
              <div className="p-5 text-sm text-destructive-strong">Couldn't load issues. {error}</div>
            ) : issues.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">
                No issues reported yet — Site Personnel's reports will appear here.
              </div>
            ) : (
              <div>
                {issues.map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    updating={updating === issue.id}
                    updateError={updateErrors[issue.id]}
                    onEdit={() => clearUpdateError(issue.id)}
                    onUpdate={(status, resolutionNotes) => updateStatus(issue.id, { status, resolutionNotes })}
                  />
                ))}
                <div className="border-t border-border px-4 py-3">
                  <DataTablePagination {...pagination} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}

IssuesPage.displayName = "IssuesPage";
