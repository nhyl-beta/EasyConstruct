import { useEffect, useState, type ReactNode } from "react";
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
import { DatePicker } from "@/components/ui/date-picker";
import { GroupedCombobox } from "@/components/shared/grouped-combobox";
import { groupEntityTypes } from "@/lib/entity-groups";
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

type DateRangeKey = "all" | "today" | "7d" | "30d" | "month" | "custom";

const DATE_RANGES: { key: DateRangeKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom range…" },
];

const isoDay = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** The from / to dates (YYYY-MM-DD, inclusive) a date-range choice stands for. */
function rangeToDates(range: DateRangeKey, customFrom: string, customTo: string) {
  const today = new Date();
  const back = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return isoDay(d);
  };
  switch (range) {
    case "today": return { dateFrom: isoDay(today), dateTo: isoDay(today) };
    case "7d": return { dateFrom: back(6), dateTo: isoDay(today) };
    case "30d": return { dateFrom: back(29), dateTo: isoDay(today) };
    case "month": return { dateFrom: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), dateTo: isoDay(today) };
    case "custom": return { dateFrom: customFrom, dateTo: customTo };
    default: return { dateFrom: "", dateTo: "" };
  }
}

const formatExact = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

const actionLabel = (a: string) => a.replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-overline uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export default function AdminActivityLogsPage() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 300);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [actor, setActor] = useState<string | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [range, setRange] = useState<DateRangeKey>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { dateFrom, dateTo } = rangeToDates(range, customFrom, customTo);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const [facets, setFacets] = useState<AuditLogFacets>({ entityTypes: [], actors: [], projects: [], actions: [] });

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
  }, [search, entityType, actor, project, action, dateFrom, dateTo]);

  const { logs, total, loading, error, reload } = useAuditLogs({
    search: search || undefined,
    entityType: entityType ?? undefined,
    actor: actor ?? undefined,
    projectCode: project ?? undefined,
    actions: action ? [action] : undefined,
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
  if (project) activeFilters.push({ key: "project", label: `Project: ${project}`, clear: () => setProject(null) });
  if (action) activeFilters.push({ key: "action", label: `Action: ${actionLabel(action)}`, clear: () => setAction(null) });
  if (range !== "all") {
    const label = range === "custom" ? `Dates: ${customFrom || "…"} to ${customTo || "…"}` : `Dates: ${DATE_RANGES.find((r) => r.key === range)?.label}`;
    activeFilters.push({ key: "range", label, clear: () => { setRange("all"); setCustomFrom(""); setCustomTo(""); } });
  }

  const clearAll = () => {
    setSearchInput("");
    setEntityType(null);
    setActor(null);
    setProject(null);
    setAction(null);
    setRange("all");
    setCustomFrom("");
    setCustomTo("");
  };

  return (
    <PageContainer>
      <PageHeader
        title="Activity logs"
        description="System-wide audit trail of create, edit, approve, reject, delete and file download actions across every module."
      />
      <PageContent className="p-6 md:p-8">
        <div className="mb-3 space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by user, action, module or summary…"
              aria-label="Search activity"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-9 border-border bg-muted/40 pl-9"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterField label="Date range">
              <Select value={range} onValueChange={(v) => setRange(v as DateRangeKey)}>
                <SelectTrigger aria-label="Date range" className="h-9 w-full rounded-lg text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_RANGES.map((r) => (
                    <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="User">
              <Select value={actor ?? ALL} onValueChange={(v) => setActor(v === ALL ? null : v)}>
                <SelectTrigger aria-label="User" className="h-9 w-full rounded-lg text-xs">
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All users</SelectItem>
                  {facets.actors.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Project">
              <Select value={project ?? ALL} onValueChange={(v) => setProject(v === ALL ? null : v)}>
                <SelectTrigger aria-label="Project" className="h-9 w-full rounded-lg text-xs">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All projects</SelectItem>
                  {facets.projects.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Module">
              <GroupedCombobox
                ariaLabel="Module"
                allLabel="All modules"
                value={entityType}
                onChange={setEntityType}
                groups={groupEntityTypes(facets.entityTypes).map((g) => ({
                  label: g.group,
                  options: g.types.map((type) => ({ value: type, label: type === DOWNLOAD_ENTITY ? "Downloads" : type })),
                }))}
              />
            </FilterField>
            <FilterField label="Action">
              <Select value={action ?? ALL} onValueChange={(v) => setAction(v === ALL ? null : v)}>
                <SelectTrigger aria-label="Action" className="h-9 w-full rounded-lg text-xs">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All actions</SelectItem>
                  {facets.actions.map((a) => (
                    <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </div>
          {range === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <FilterField label="From date">
                <DatePicker value={customFrom} max={customTo || undefined} onChange={setCustomFrom} className="w-44" />
              </FilterField>
              <FilterField label="To date">
                <DatePicker value={customTo} min={customFrom || undefined} onChange={setCustomTo} className="w-44" />
              </FilterField>
            </div>
          )}
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
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs text-muted-foreground" title={formatRelativeTime(log.createdAt)}>
                      {formatExact(log.createdAt)}
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
