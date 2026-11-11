import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { Fragment, useMemo, useState } from "react";
import { useOpenOnAction } from "@/features/quick-search/useOpenOnAction";
import { Link, useSearchParams } from "react-router";
import { ChevronDown, ChevronRight, CornerDownRight, FileSignature, Plus, Search, X } from "lucide-react";

import { useAuth } from "@/auth/auth-context";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateRequestDialog } from "@/features/requests/components/CreateRequestDialog";
import { EmailStatusBadge, formatDate, KindBadge, OverdueBadge, RecipientBadge, RequestStatusBadge } from "@/features/requests/components/RequestBadges";
import { RequestDetailSheet } from "@/features/requests/components/RequestDetailSheet";
import { useRequests } from "@/features/requests/hooks/useRequests";
import { nestFollowUps } from "@/features/requests/lib/nest-follow-ups";
import { REQUEST_KINDS, REQUEST_STATUSES, STATUS_LABEL, type DesignRequest, type RequestFilters } from "@/features/requests/types/request.types";

const RAISERS = new Set(["project-manager", "engineer", "admin"]);
const RESPONDERS = new Set(["architect", "consultant"]);

/**
 * RFI / RFA requests. The PM and Engineers raise and track them; the Architect
 * and Consultant answer from their inbox; Admin oversees all of it.
 */
export default function SharedRequests() {
  const { user } = useAuth();
  const role = user?.role ?? "";
  const canRaise = RAISERS.has(role);
  const isResponder = RESPONDERS.has(role);
  const [params, setParams] = useSearchParams();

  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [kind, setKind] = useState<RequestFilters["kind"]>("all");
  const [status, setStatus] = useState<RequestFilters["status"]>("all");
  const [query, setQuery] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  useOpenOnAction("raise", () => setCreating(true));

  const box = scope === "mine" ? (isResponder ? "inbox" : canRaise && role !== "admin" ? "raised" : undefined) : undefined;
  const { requests, loading, error, reload } = useRequests({ kind, status, search: query, box, overdue: overdueOnly });
  // B-208: follow-ups are listed under the request they follow up; paging counts top-level requests.
  const nested = useMemo(() => nestFollowUps(requests), [requests]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const pg = usePagination(nested, 10, `${scope}|${kind}|${status}|${query}|${overdueOnly}`);

  const openId = Number(params.get("open")) || null;
  const setOpen = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("open", String(id));
    else next.delete("open");
    setParams(next, { replace: true });
  };

  const renderRow = (
    r: DesignRequest,
    followUpToggle?: { count: number; open: boolean; toggle: () => void },
    isFollowUp = false,
  ) => (
    <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r.id)}>
      <TableCell className="whitespace-normal">
        <div className={`flex items-center gap-2 ${isFollowUp ? "pl-6" : ""}`}>
          {isFollowUp && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
          <button
            type="button"
            className="flex items-center gap-2 text-left"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(r.id);
            }}
            aria-label={`Open ${r.number}`}
          >
            <KindBadge kind={r.kind} />
            <span>
              <span className="block font-mono text-xs">{r.number}</span>
              <span className="block text-sm">{r.subject}</span>
            </span>
          </button>
          {followUpToggle && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 gap-1 rounded-full px-2 text-overline"
              aria-expanded={followUpToggle.open}
              onClick={(e) => {
                e.stopPropagation();
                followUpToggle.toggle();
              }}
            >
              {followUpToggle.open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {followUpToggle.count} follow-up{followUpToggle.count === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs">{r.projectCode}</TableCell>
      <TableCell className="hidden text-sm md:table-cell">{isResponder && scope === "mine" ? r.requestedByName : r.recipientType === "client" ? (r.recipientEmail ?? "Client") : r.assignedToName}</TableCell>
      <TableCell className="hidden text-sm sm:table-cell">{formatDate(r.dueDate)}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <RequestStatusBadge status={r.status} />
          <RecipientBadge request={r} />
          <EmailStatusBadge request={r} />
          <OverdueBadge request={r} />
        </div>
      </TableCell>
    </TableRow>
  );

  const hasFilters = kind !== "all" || status !== "all" || query !== "" || overdueOnly;
  const mineLabel = isResponder ? "My inbox" : "Raised by me";

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Requests"
        description="Requests for information (RFI) and approval (RFA) between the site and the design team."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/transmittals">
                <FileSignature className="mr-1 h-3.5 w-3.5" /> Transmittals
              </Link>
            </Button>
            {canRaise && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Raise request
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filter requests">
        {role !== "admin" && (
          <div className="inline-flex rounded-xl border p-0.5" role="group" aria-label="Which requests">
            {(["mine", "all"] as const).map((s) => (
              <Button key={s} size="sm" variant={scope === s ? "default" : "ghost"} className="h-7 px-3 text-xs" onClick={() => setScope(s)} aria-pressed={scope === s}>
                {s === "mine" ? mineLabel : "All on my projects"}
              </Button>
            ))}
          </div>
        )}
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, subject, sheet…" aria-label="Search requests" className="h-8 pl-8 text-xs" />
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v as RequestFilters["kind"])}>
          <SelectTrigger aria-label="Filter by type" className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {REQUEST_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as RequestFilters["status"])}>
          <SelectTrigger aria-label="Filter by status" className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {REQUEST_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant={overdueOnly ? "default" : "outline"} className="h-8 text-xs" onClick={() => setOverdueOnly((o) => !o)} aria-pressed={overdueOnly}>
          Overdue only
        </Button>
        {hasFilters && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => {
              setKind("all");
              setStatus("all");
              setQuery("");
              setOverdueOnly(false);
            }}
          >
            <X className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {error ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive-strong">
          <span>Couldn't load requests. {error}</span>
          <Button size="sm" variant="outline" onClick={reload}>
            Retry
          </Button>
        </div>
      ) : loading && requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading requests…</p>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {hasFilters ? "No requests match these filters." : isResponder && scope === "mine" ? "Nothing is waiting for your response." : "No requests yet."}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40 text-left text-overline font-medium uppercase tracking-wider text-muted-foreground hover:bg-muted/40">
                <TableHead>Request</TableHead>
                <TableHead>Project</TableHead>
                <TableHead className="hidden md:table-cell">{isResponder && scope === "mine" ? "From" : "To"}</TableHead>
                <TableHead className="hidden sm:table-cell">Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pg.pageItems.map(({ request: r, followUps }) => {
                const open = expanded.has(r.id);
                return (
                  <Fragment key={r.id}>
                    {renderRow(r, followUps.length > 0 ? { count: followUps.length, open, toggle: () => toggleExpanded(r.id) } : undefined)}
                    {open && followUps.map((f) => renderRow(f, undefined, true))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
          </div>
          <div className="p-2">
            <DataTablePagination {...pg} />
          </div>
          </CardContent>
        </Card>
      )}

      <RequestDetailSheet id={openId} onOpenChange={(o) => !o && setOpen(null)} onChanged={reload} />
      <CreateRequestDialog open={creating} onOpenChange={setCreating} onCreated={(created) => { reload(); setOpen(created.id); }} />
    </div>
  );
}

SharedRequests.displayName = "SharedRequests";
