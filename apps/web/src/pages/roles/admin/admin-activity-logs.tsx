import { useEffect, useState } from "react";
import { Search, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useAuditLogs } from "@/features/audit-logs/hooks/useAuditLogs";
import { AuditLogRepository } from "@/features/audit-logs/repositories/audit-log.repository";
import type { AuditLogFacets } from "@/features/audit-logs/types/audit-log.types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatRelativeTime } from "@/lib/format-relative-time";

const ACTION_TONE: Record<string, string> = {
  created: "bg-primary/10 text-primary-strong border-primary/20",
  approved: "bg-success/10 text-success-strong border-success/20",
  rejected: "bg-destructive/10 text-destructive-strong border-destructive/20",
  deleted: "bg-destructive/10 text-destructive-strong border-destructive/20",
  updated: "bg-warning/15 text-warning-strong border-warning/30",
  downloaded: "bg-primary/10 text-primary-strong border-primary/20",
  sensitive_download: "bg-warning/15 text-warning-strong border-warning/30",
  download_blocked: "bg-destructive/10 text-destructive-strong border-destructive/20",
  integrity_failed: "bg-destructive/10 text-destructive-strong border-destructive/20",
};

// The audit entity every file download is recorded under (apps/api/src/uploads/download-audit.ts).
const DOWNLOAD_ENTITY = "file";

const PAGE_SIZE = 10;
const ALL = "all";

export default function AdminActivityLogsPage() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 300);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [actor, setActor] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const [facets, setFacets] = useState<AuditLogFacets>({ entityTypes: [], actors: [] });

  useEffect(() => {
    AuditLogRepository.facets()
      .then(setFacets)
      .catch(() => {
        // filter dropdowns just stay empty — the list itself still works
      });
  }, []);

  // D1: every filter change resets to page 1 — otherwise a narrower result
  // set can leave the user stranded on a now-nonexistent page.
  useEffect(() => {
    setPage(1);
  }, [search, entityType, actor, dateFrom, dateTo]);

  const { logs, total, loading, error, reload } = useAuditLogs({
    search: search || undefined,
    entityType: entityType ?? undefined,
    actor: actor ?? undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    perPage: pageSize,
  });

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (search) activeFilters.push({ key: "search", label: `Search: "${search}"`, clear: () => setSearchInput("") });
  if (entityType) activeFilters.push({ key: "entityType", label: `Module: ${entityType === DOWNLOAD_ENTITY ? "Downloads" : entityType}`, clear: () => setEntityType(null) });
  if (actor) activeFilters.push({ key: "actor", label: `User: ${actor}`, clear: () => setActor(null) });
  if (dateFrom) activeFilters.push({ key: "dateFrom", label: `From: ${dateFrom}`, clear: () => setDateFrom("") });
  if (dateTo) activeFilters.push({ key: "dateTo", label: `To: ${dateTo}`, clear: () => setDateTo("") });

  const clearAll = () => {
    setSearchInput("");
    setEntityType(null);
    setActor(null);
    setDateFrom("");
    setDateTo("");
  };

  return (
    <PageContainer>
      <PageHeader
        title="Activity logs"
        description="System-wide audit trail of create, edit, approve, reject, delete and file download actions across every module."
      />
      <PageContent className="p-6 md:p-8">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={`cursor-pointer rounded-full text-overline ${entityType === null ? "border-primary text-primary-strong" : ""}`}
              onClick={() => setEntityType(null)}
            >
              All modules
            </Badge>
            <Badge
              variant="outline"
              className={`cursor-pointer rounded-full text-overline ${entityType === DOWNLOAD_ENTITY ? "border-primary text-primary-strong" : ""}`}
              onClick={() => setEntityType(entityType === DOWNLOAD_ENTITY ? null : DOWNLOAD_ENTITY)}
            >
              Downloads
            </Badge>
            {facets.entityTypes.filter((type) => type !== DOWNLOAD_ENTITY).map((type) => (
              <Badge
                key={type}
                variant="outline"
                className={`cursor-pointer rounded-full text-overline capitalize ${entityType === type ? "border-primary text-primary-strong" : ""}`}
                onClick={() => setEntityType(entityType === type ? null : type)}
              >
                {type}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={actor ?? ALL} onValueChange={(v) => setActor(v === ALL ? null : v)}>
              <SelectTrigger className="h-9 w-40 text-xs">
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All users</SelectItem>
                {facets.actors.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              aria-label="From date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-36 text-xs"
            />
            <Input
              type="date"
              aria-label="To date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-36 text-xs"
            />
            <div className="relative w-full md:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search activity…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-9 border-border bg-muted/40 pl-9"
              />
            </div>
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
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
            <button type="button" onClick={clearAll} className="text-overline text-muted-foreground underline underline-offset-2">
              Clear all
            </button>
          </div>
        )}

        {loading && <p className="p-5 text-sm text-muted-foreground">Loading activity…</p>}
        {!loading && error && (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-strong">
            Couldn't load activity logs. {error.message}
            <button className="underline underline-offset-2" onClick={() => reload()}>
              Retry
            </button>
          </div>
        )}
        {!loading && !error && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/50 px-6 py-12 text-center">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {activeFilters.length === 0 ? "No activity recorded yet." : "No activity matches your filters."}
            </p>
          </div>
        )}
        {!loading && !error && logs.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-overline uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5">Actor</th>
                  <th className="px-3 py-2.5">Action</th>
                  <th className="px-3 py-2.5">Entity</th>
                  <th className="px-3 py-2.5">Project</th>
                  <th className="px-3 py-2.5">Summary</th>
                  <th className="px-5 py-2.5">When</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-5 py-3.5 font-medium">{log.actor}</td>
                    <td className="px-3 py-3.5">
                      <Badge variant="outline" className={`rounded-full text-overline capitalize ${ACTION_TONE[log.action] ?? ""}`}>
                        {log.action.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-3.5 font-mono text-xs text-muted-foreground">
                      {log.entityType} #{log.entityId}
                    </td>
                    <td className="px-3 py-3.5 font-mono text-xs text-muted-foreground">
                      {log.projectCode ?? "—"}
                    </td>
                    <td className="px-3 py-3.5 text-muted-foreground">{log.summary ?? "—"}</td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {formatRelativeTime(log.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-border px-2 py-3">
              <DataTablePagination
                currentPage={page}
                pageCount={pageCount}
                setCurrentPage={setPage}
                pageSize={pageSize}
                setPageSize={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                total={total}
              />
            </div>
          </div>
        )}
      </PageContent>
    </PageContainer>
  );
}

AdminActivityLogsPage.displayName = "AdminActivityLogsPage";
