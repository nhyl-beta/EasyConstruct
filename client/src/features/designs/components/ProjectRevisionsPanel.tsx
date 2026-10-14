import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, GitCommitHorizontal, Wand2 } from "lucide-react";

import { useAuth } from "@/auth/auth-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/refine-ui/views/empty-state";
import { useProjectDesigns } from "../hooks/useProjectDesigns";
import { useProjectRevisions } from "../hooks/useProjectRevisions";
import type { ProjectRevision } from "../types/design-revision.types";

const absolute = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

/** "3 days ago", "2 months ago" — the absolute date is in the element's title. */
const relative = (iso: string | null): string => {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
};

function RevisionEntry({ r }: { r: ProjectRevision }) {
  const [open, setOpen] = useState(false);
  const long = (r.changeSummary ?? "").length > 140 || (r.reason ?? "").length > 140;
  return (
    <li className="relative border-l border-border pl-5">
      <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border border-background bg-primary" aria-hidden />
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 font-mono text-xs font-medium">
          {r.parentVersion ?? "new"} <ArrowRight className="h-3 w-3 text-muted-foreground" /> {r.version}
        </span>
        <span className="text-overline text-muted-foreground">Rev {r.revisionNumber}</span>
        <StatusBadge status={r.status} />
        {r.isDemo && (
          <Badge variant="outline" className="rounded-full border-dashed text-overline font-normal text-muted-foreground">
            Demo data
          </Badge>
        )}
      </div>
      {r.reason && <p className="mt-1 text-sm">{r.reason}</p>}
      {r.changeSummary && (
        <p className={`mt-0.5 text-xs text-muted-foreground ${open ? "" : "line-clamp-2"}`}>{r.changeSummary}</p>
      )}
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-0.5 inline-flex items-center gap-0.5 text-overline text-primary-strong hover:underline"
          aria-expanded={open}
        >
          {open ? (
            <>
              Show less <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Show more <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      )}
      <p className="mt-1 text-overline text-muted-foreground">
        {r.createdBy} ·{" "}
        <time dateTime={r.createdAt ?? undefined} title={absolute(r.createdAt)}>
          {relative(r.createdAt)}
        </time>
        {r.approvedAt && (
          <>
            {" "}
            · approved{" "}
            <time dateTime={r.approvedAt} title={absolute(r.approvedAt)}>
              {absolute(r.approvedAt)}
            </time>
          </>
        )}
      </p>
    </li>
  );
}

/**
 * The design change history of one project, grouped by design, newest first.
 * Read-only. Demo rows are badged; "Generate demo revisions" is an explicit
 * admin action (the page load never writes anything).
 */
export function ProjectRevisionsPanel({ projectCode, projectStatus }: { projectCode: string; projectStatus: string }) {
  const { user } = useAuth();
  const { revisions, summary, loading, error, refetch, generateDemo, generating } = useProjectRevisions(projectCode);
  const { designs, loading: designsLoading } = useProjectDesigns(projectCode);
  const [designFilter, setDesignFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";
  const canGenerate = isAdmin && summary?.demoAllowed !== false;

  const filtered = useMemo(
    () =>
      revisions.filter(
        (r) => (designFilter === "all" || String(r.designId) === designFilter) && (statusFilter === "all" || r.status === statusFilter),
      ),
    [revisions, designFilter, statusFilter],
  );
  const groups = useMemo(() => {
    const byDesign = new Map<number, { name: string; code: string; discipline: string; rows: ProjectRevision[] }>();
    for (const r of filtered) {
      const g = byDesign.get(r.designId) ?? { name: r.designName, code: r.designCode, discipline: r.discipline, rows: [] };
      g.rows.push(r);
      byDesign.set(r.designId, g);
    }
    return [...byDesign.entries()];
  }, [filtered]);
  const groupsPage = usePagination(groups, 5, `${designFilter}|${statusFilter}`);
  const designOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of revisions) m.set(r.designId, `${r.designCode} · ${r.designName}`);
    return [...m.entries()];
  }, [revisions]);
  const statuses = useMemo(() => [...new Set(revisions.map((r) => r.status))], [revisions]);

  const onGenerate = async () => {
    setConfirming(false);
    const result = await generateDemo();
    setNotice(result ? (result.skipped ? `Nothing generated: ${result.skipped}.` : `Generated ${result.created} demo revision(s).`) : null);
  };

  const proposalPhase = projectStatus === "Proposal";
  const noDesigns = !designsLoading && designs.length === 0;

  let body;
  if (loading) {
    body = <p className="text-sm text-muted-foreground">Loading revisions…</p>;
  } else if (error && revisions.length === 0) {
    body = (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-strong">
        <span>{error}</span>
        <Button size="sm" variant="outline" onClick={refetch}>
          Retry
        </Button>
      </div>
    );
  } else if (revisions.length === 0) {
    const copy = proposalPhase
      ? { title: "Revisions start once a design exists.", description: "This project is still in the Proposal phase." }
      : noDesigns
        ? { title: "No designs yet", description: "Revisions appear here once the architect submits a design for this project." }
        : { title: "No revisions recorded", description: "This project has designs, but none of them has a revision history yet." };
    body = (
      <EmptyState
        title={copy.title}
        description={copy.description}
        action={
          canGenerate && !proposalPhase ? (
            <Button size="sm" variant="outline" disabled={generating} onClick={() => setConfirming(true)}>
              <Wand2 className="mr-1 h-3.5 w-3.5" /> {generating ? "Generating…" : "Generate demo revisions"}
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Revisions", String(summary?.total ?? revisions.length)],
            ["Latest version", summary?.latestVersion ?? "—"],
            ["Awaiting approval", String(summary?.awaitingApproval ?? 0)],
            ["Last change", relative(summary?.latestChangeAt ?? null)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border px-3 py-2">
              <dt className="text-overline text-muted-foreground">{label}</dt>
              <dd className="text-sm font-semibold" title={label === "Last change" ? absolute(summary?.latestChangeAt ?? null) : undefined}>
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter revisions">
          <Select value={designFilter} onValueChange={setDesignFilter}>
            <SelectTrigger aria-label="Filter by design" className="h-8 w-56 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All designs</SelectItem>
              {designOptions.map(([id, label]) => (
                <SelectItem key={id} value={String(id)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="Filter by status" className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <span role="alert" className="text-xs text-destructive-strong">{error}</span>}
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No revisions match these filters.</p>
        ) : (
          <>
          {groupsPage.pageItems.map(([designId, g]) => (
            <section key={designId} aria-label={`${g.name} revisions`}>
              <h3 className="mb-2 flex flex-wrap items-baseline gap-2 text-sm font-medium">
                {g.name}
                <span className="font-mono text-overline font-normal text-muted-foreground">
                  {g.code}
                  {g.discipline ? ` · ${g.discipline}` : ""}
                </span>
              </h3>
              <ol className="ml-1 space-y-4">
                {g.rows.map((r) => (
                  <RevisionEntry key={r.id} r={r} />
                ))}
              </ol>
            </section>
          ))}
          <DataTablePagination {...groupsPage} compact />
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <SectionCard
        title="Design change history"
        subtitle="Every revision to this project's designs, newest first (version-to-version, with the reason for each change)."
        badge={summary && summary.total > 0 ? `${summary.total} revisions` : undefined}
        actions={<GitCommitHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />}
      >
        {body}
        {notice && (
          <p role="status" className="mt-3 text-xs text-muted-foreground">
            {notice}
          </p>
        )}
      </SectionCard>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Generate demo revisions?"
        description="Adds clearly labelled “Demo data” revisions to this project's designs so the history can be shown. They can be removed with one command (npm run demo:revisions -- --remove). Nothing is generated if the project already has revisions."
        confirmLabel="Generate"
        destructive={false}
        loading={generating}
        onConfirm={() => void onGenerate()}
      />
    </>
  );
}
