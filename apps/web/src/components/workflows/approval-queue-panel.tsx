// apps/web/src/components/workflows/approval-queue-panel.tsx
//
// The approval queue, once. Every role that decides on a workflow stage sees
// this: Project Manager, Consultant, Engineer, Finance Manager, Human
// Resources and Architect through /approvals, and Admin / IT Designer through
// the Approvals tab of workflow oversight. The server scopes the queue to the
// caller's own role, so the same component serves all of them.
//
// It was previously copied between pm-approvals.tsx and admin-workflows.tsx,
// which is how the Admin's final-approval view ended up without the "view
// details" action the PM's had — the admin, deciding last, could see the least.
// One component means a fix to what an approver can see before deciding lands
// for every role at the same time.
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Eye,
  FileCheck2,
  ListTree,
  Paperclip,
  PenLine,
  Search,
  Upload,
  X,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useAuth } from "@/auth/auth-context";
import { WorkflowDetailDialog } from "@/components/workflows/workflow-detail-dialog";
import { WorkflowInitiationActions } from "@/components/workflows/workflow-initiation-actions";
import { useApprovalsPaged } from "@/features/workflows/hooks/useWorkflows";
import { WorkflowRepository } from "@/features/workflows/repositories/workflow.repository";
import { WorkflowFormatService } from "@/features/workflows/services/workflow.service";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { ApprovalScope } from "@/features/workflows/types/workflow.types";

const ALL = "all";

// "medium" is text-warning-strong, not text-warning-foreground — that token is dark
// ink meant for text ON a filled bg-warning chip, not standalone text on a
// translucent bg-warning/15 tint; its dark-mode value is nearly black.
const SEVERITY_TONE: Record<string, string> = {
  high: "bg-destructive/10 text-destructive-strong border-destructive/20",
  medium: "bg-warning/15 text-warning-strong border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
};

interface ApprovalQueuePanelProps {
  /** Copy for the empty "pending" state — org-wide on the admin screen. */
  emptyPendingMessage?: string;
  /** Admin's oversight page has its own "New workflow" button above. */
  showInitiationActions?: boolean;
}

export function ApprovalQueuePanel({
  emptyPendingMessage = "Nothing pending your decision.",
  showInitiationActions = true,
}: ApprovalQueuePanelProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<ApprovalScope>("pending");
    const [comments, setComments] = useState<Record<number, string>>({});
  // A document Finance (or any approver) attaches to the workflow before
  // deciding on it — e.g. Finance's own cost-impact worksheet on a budget
  // change. Uploaded immediately on "Attach", independently of the eventual
  // decision, so it is filed against the workflow (and visible in "View
  // details") whether the approver ends up approving, rejecting or asking
  // for revision.
  const [pendingFiles, setPendingFiles] = useState<Record<number, File | null>>({});
  const [uploadingStageId, setUploadingStageId] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const attachDocument = async (workflowId: number, stageId: number) => {
    const file = pendingFiles[stageId];
    if (!file) return;
    setUploadingStageId(stageId);
    setUploadError(null);
    try {
      await WorkflowRepository.uploadAttachment(workflowId, file, file.name);
      setPendingFiles((prev) => ({ ...prev, [stageId]: null }));
      await reload();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to attach the document.",
      );
    } finally {
      setUploadingStageId(null);
    }
  };
  const [detailWorkflowId, setDetailWorkflowId] = useState<number | null>(null);
  // Fix 2.7: tick several pending items and approve them in one go. Each is still
  // decided by the normal per-stage endpoint, so every server rule applies to it.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);

  // Search, type, requester and date filters and paging run on the server
  // (GET /workflows/approvals?...); only the filter state lives here.
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [requesterFilter, setRequesterFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const {
    list,
    items,
    typeOptions,
    requesterOptions,
    stats,
    loading,
    deciding,
    error,
    decide,
    reload,
  } = useApprovalsPaged(tab, { type: typeFilter, requestedBy: requesterFilter, dateFrom, dateTo });
  // A refused decision (server rule, stale stage) used to show only a banner far from the button.
  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const DECISION_DONE = { approve: "approved", reject: "rejected", revise: "sent back for revision" } as const;
  const decideWithToast = async (a: { workflowId: number; stageId: number; workflowCode: string }, decision: keyof typeof DECISION_DONE) => {
    const result = await decide(a.workflowId, a.stageId, { decision, comments: comments[a.stageId]?.trim() || undefined });
    if (result) toast.success(`${a.workflowCode} ${DECISION_DONE[decision]}`);
  };
  const searchInput = list.searchInput;
  const setSearchInput = list.setSearchInput;
  const search = list.search;
  const filteredItems = items;
  const filtering = !!(search || typeFilter || requesterFilter || dateFrom || dateTo);

  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (search) activeFilters.push({ key: "search", label: `Search: "${search}"`, clear: () => setSearchInput("") });
  if (typeFilter) activeFilters.push({ key: "type", label: `Type: ${typeFilter}`, clear: () => setTypeFilter(null) });
  if (requesterFilter) activeFilters.push({ key: "requester", label: `Requested by: ${requesterFilter}`, clear: () => setRequesterFilter(null) });
  if (dateFrom) activeFilters.push({ key: "dateFrom", label: `From: ${dateFrom}`, clear: () => setDateFrom("") });
  if (dateTo) activeFilters.push({ key: "dateTo", label: `To: ${dateTo}`, clear: () => setDateTo("") });

  const pagination = list;
  // Changing tab goes back to the first page.
  useEffect(() => {
    pagination.setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  // A selection belongs to what is on screen: a new tab, page or filter starts clean.
  const selectionKey = `${tab}|${pagination.currentPage}|${search}|${typeFilter}|${requesterFilter}|${dateFrom}|${dateTo}`;
  useEffect(() => {
    setSelected(new Set());
  }, [selectionKey]);

  // IT Designer's workflow scope is read-only, enforced first on the server
  // (apps/api/src/workflows/routes.ts) — decide/attach would 403 there even if
  // shown here. Hidden client-side too, so IT Designer doesn't hit a wall of
  // silent failures on buttons that were never going to work for this role.
  const canDecide = user?.role !== "it-designer";

  const pageItemsForBulk = pagination.pageItems;
  const selectedItems = pageItemsForBulk.filter((a) => selected.has(a.stageId));
  const toggleSelected = (stageId: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(stageId);
      else next.delete(stageId);
      return next;
    });

  const runBulkApprove = async () => {
    setBulkRunning(true);
    const failed: string[] = [];
    let approved = 0;
    for (const a of selectedItems) {
      try {
        await WorkflowRepository.decideStage(a.workflowId, a.stageId, {
          decision: "approve",
          comments: comments[a.stageId]?.trim() || undefined,
        });
        approved += 1;
      } catch (err) {
        failed.push(`${a.workflowCode}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    setBulkRunning(false);
    setBulkConfirm(false);
    setSelected(new Set());
    await reload();
    if (approved > 0) toast.success(`${approved} item${approved === 1 ? "" : "s"} approved`);
    if (failed.length > 0) toast.error(`${failed.length} could not be approved. ${failed.slice(0, 3).join(" | ")}`);
  };

  const statCards = stats
    ? [
        { label: "Pending", value: `${stats.pending}`, tone: "text-foreground" },
        {
          label: "Overdue",
          value: `${stats.overdue}`,
          tone: stats.overdue > 0 ? "text-destructive-strong" : "text-foreground",
        },
        { label: "Avg cycle", value: `${stats.avgCycleDays}d`, tone: "text-foreground" },
        { label: "This week", value: `${stats.thisWeek}`, tone: "text-foreground" },
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Roles that own a stage in a template can also start the chain that
          reaches it — Architect, Engineer and HR each get their own actions
          here; every other role sees nothing. */}
      {showInitiationActions && (
        <WorkflowInitiationActions role={user?.role ?? ""} onCreated={() => void reload()} />
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="space-y-1 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {s.label}
              </div>
              <div className={`text-2xl font-semibold tabular-nums ${s.tone}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as ApprovalScope)}>
          <TabsList className="h-10">
            <TabsTrigger value="pending">
              Pending
            </TabsTrigger>
            <TabsTrigger value="mine">
              Decided by me
            </TabsTrigger>
            <TabsTrigger value="history">
              History
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={typeFilter ?? ALL} onValueChange={(v) => setTypeFilter(v === ALL ? null : v)}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {typeOptions.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={requesterFilter ?? ALL} onValueChange={(v) => setRequesterFilter(v === ALL ? null : v)}>
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue placeholder="All requesters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All requesters</SelectItem>
            {requesterOptions.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          aria-label="From date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-9 w-41 text-xs"
        />
        <Input
          type="date"
          aria-label="To date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-9 w-41 text-xs"
        />
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search approvals…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 bg-muted/40 pl-9"
          />
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((f) => (
            <Badge
              key={f.key}
              variant="outline"
              className="flex items-center gap-1 rounded-full border-primary/30 text-overline text-primary-strong"
            >
              {f.label}
              <button type="button" onClick={f.clear} aria-label={`Clear ${f.label}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setTypeFilter(null);
              setRequesterFilter(null);
              setDateFrom("");
              setDateTo("");
            }}
            className="text-overline text-muted-foreground underline underline-offset-2"
          >
            Clear all
          </button>
        </div>
      )}

      {/* A failed decision used to be swallowed into hook state with nothing
          on screen, which reads as "the button does nothing". */}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive-strong"
        >
          {error.message}
        </p>
      )}

      {uploadError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive-strong"
        >
          {uploadError}
        </p>
      )}

      {tab === "pending" && canDecide && pagination.pageItems.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 px-3 py-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={selectedItems.length > 0 && selectedItems.length === pagination.pageItems.length}
              onCheckedChange={(on) => setSelected(on ? new Set(pagination.pageItems.map((a) => a.stageId)) : new Set())}
              aria-label="Select all on this page"
            />
            Select all on this page
          </label>
          <Button size="sm" disabled={selectedItems.length === 0 || bulkRunning} onClick={() => setBulkConfirm(true)}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve selected{selectedItems.length > 0 ? ` (${selectedItems.length})` : ""}
          </Button>
          <span className="text-xs text-muted-foreground">Open View details first for anything you have not read.</span>
        </div>
      )}

      <div className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading approvals…</p>}
        {!loading && items.length === 0 && !filtering && (
          <p className="text-sm text-muted-foreground">
            {tab === "pending" ? emptyPendingMessage : "No items here yet."}
          </p>
        )}
        {!loading && items.length === 0 && filtering && (
          <p className="text-sm text-muted-foreground">No approvals match your filters.</p>
        )}
        {pagination.pageItems.map((a) => (
          <Card key={a.stageId}>
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  {tab === "pending" && canDecide && (
                    <Checkbox
                      className="mt-3"
                      checked={selected.has(a.stageId)}
                      onCheckedChange={(on) => toggleSelected(a.stageId, on === true)}
                      aria-label={`Select ${a.title}`}
                    />
                  )}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-secondary-foreground">
                    <FileCheck2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-overline text-muted-foreground">
                        {a.workflowCode}
                      </span>
                      <span className="font-medium">{a.title}</span>
                      <Badge
                        variant="outline"
                        className={`rounded-full px-2 py-0.5 text-overline ${SEVERITY_TONE[a.severity]}`}
                      >
                        {a.severity}
                      </Badge>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{a.projectCode}</span>
                      <span>·</span>
                      <span>{a.type ?? "—"}</span>
                      <span>·</span>
                      <span>{a.ownerRoleLabel}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {formatRelativeTime(a.createdAt)}
                      </span>
                    </div>

                    {/* Says there is something to read before deciding — a row
                        that advertises nothing is a row nobody opens. */}
                    {(a.attachmentCount > 0 || a.lineItemCount > 0) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {a.attachmentCount > 0 && (
                          <Badge variant="outline" className="rounded-full text-overline">
                            <Paperclip className="mr-1 h-3 w-3" />
                            {a.attachmentCount} submitted{" "}
                            {a.attachmentCount === 1 ? "item" : "items"}
                          </Badge>
                        )}
                        {a.lineItemCount > 0 && (
                          <Badge variant="outline" className="rounded-full text-overline">
                            <ListTree className="mr-1 h-3 w-3" />
                            {a.lineItemCount} cost{" "}
                            {a.lineItemCount === 1 ? "change" : "changes"}
                          </Badge>
                        )}
                      </div>
                    )}

                  </div>
                </div>

                <div className="flex items-center gap-2 md:flex-col md:items-end">
                  <span className="text-sm font-medium tabular-nums">
                    {WorkflowFormatService.amount(a.amount)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setDetailWorkflowId(a.workflowId)}
                  >
                    <Eye className="h-3.5 w-3.5" /> View details
                  </Button>
                  {tab === "pending" && !canDecide ? (
                    <Badge variant="outline" className="rounded-full text-overline">
                      Read-only
                    </Badge>
                  ) : tab === "pending" ? (
                    <div className="flex w-full flex-col items-end gap-2 md:w-174">
                      {/* Finance needed a way to attach its own cost-impact
                          document to a budget change before approving it —
                          there was no upload affordance anywhere on this
                          screen, only the comment box. Any approver can use
                          it; it is not finance-specific in the component. */}
                      <div className="flex w-full items-center gap-1.5">
                        {/* The native <input type="file"> renders its own
                            "Choose File" / "No file chosen" text, which
                            can't be shortened via `placeholder` and wrapped
                            badly once squeezed next to the Attach button.
                            Hidden input + our own truncated label, same
                            pattern as architect-design-create.tsx. */}
                        <label className="flex h-8 flex-1 min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-xs hover:border-primary/40">
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {pendingFiles[a.stageId]?.name ?? "Choose file"}
                          </span>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg"
                            className="hidden"
                            onChange={(e) =>
                              setPendingFiles((prev) => ({
                                ...prev,
                                [a.stageId]: e.target.files?.[0] ?? null,
                              }))
                            }
                          />
                        </label>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 text-xs"
                          disabled={!pendingFiles[a.stageId] || uploadingStageId === a.stageId}
                          onClick={() => void attachDocument(a.workflowId, a.stageId)}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {uploadingStageId === a.stageId ? "Attaching…" : "Attach"}
                        </Button>
                      </div>
                      <Textarea
                        placeholder="Add a comment or justification (optional)"
                        className="min-h-16 text-xs"
                        value={comments[a.stageId] ?? ""}
                        onChange={(e) =>
                          setComments((prev) => ({ ...prev, [a.stageId]: e.target.value }))
                        }
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          disabled={deciding === a.stageId}
                          title="Send back to the submitter for revision"
                          onClick={() => void decideWithToast(a, "revise")}
                        >
                          <PenLine className="h-3.5 w-3.5" /> Request revision
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={deciding === a.stageId}
                          onClick={() => void decideWithToast(a, "reject")}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={deciding === a.stageId}
                          onClick={() => void decideWithToast(a, "approve")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {deciding === a.stageId ? "Saving…" : "Approve"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Badge variant="outline" className="rounded-full text-overline capitalize">
                      {a.status.replace("-", " ")}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && filteredItems.length > 0 && (
          <div className="rounded-2xl border border-border px-2 py-2">
            <DataTablePagination {...pagination} />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={bulkConfirm}
        onOpenChange={(open) => !bulkRunning && setBulkConfirm(open)}
        title={`Approve ${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"}?`}
        description={
          selectedItems.slice(0, 6).map((a) => `${a.workflowCode} ${a.title} (${WorkflowFormatService.amount(a.amount)})`).join("; ") +
          (selectedItems.length > 6 ? `; and ${selectedItems.length - 6} more` : "") +
          ". Each is approved on its own, with the comment typed on it if there is one. An item the server will not approve is reported and left as it was."
        }
        confirmLabel={bulkRunning ? "Approving…" : "Approve all"}
        destructive={false}
        loading={bulkRunning}
        onConfirm={() => void runBulkApprove()}
      />

      <WorkflowDetailDialog
        workflowId={detailWorkflowId}
        onOpenChange={(next) => {
          if (!next) setDetailWorkflowId(null);
        }}
      />
    </div>
  );
}

ApprovalQueuePanel.displayName = "ApprovalQueuePanel";
