import { FolderKanban, Info, Search } from "lucide-react";

import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useServerList } from "@/hooks/use-server-list";
import { qk } from "@/lib/query-keys";
import { ProjectRepository } from "@/features/projects/repositories/project.repository";
import type { Project } from "@/features/projects/types/project.types";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { formatDue } from "@/features/projects/lib/project-format";

const riskToneClasses: Record<string, string> = {
  high: "text-destructive-strong font-medium",
  // text-warning-strong, not text-warning-foreground — that token is dark ink meant
  // for text ON a filled warning chip; standalone on the page background its
  // dark-mode value is nearly black on the app's own dark background.
  medium: "text-warning-strong font-medium",
  low: "text-muted-foreground",
};

// Consultant previously reached the shared PM projects page, which carries
// create/edit affordances and full commercial data. This view is read-only by
// construction — no create button, no row navigation into the editable detail
// page, no budget or contract columns. The restriction is enforced on the API
// too (projects/service.ts scopes Consultant to the projects it is staffed on
// and strips contractValue/budget/workforce), so this page can only render
// what the role is entitled to see.
export default function ConsultantProjects() {
  // Search and paging happen on the server (the Consultant's staffed, non-archived projects).
  const list = useServerList<Project>({
    key: (params) => qk.projects.list({ ...params, role: "consultant" }),
    fetchPage: async (params) => {
      const page = await ProjectRepository.listPage({
        page: params.page,
        pageSize: params.limit,
        search: params.search,
        excludeArchived: true,
      });
      return { items: page.items, total: page.total, pages: page.pages };
    },
  });
  const { pageItems: filtered, error } = list;
  const loading = list.loading;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Projects"
        description="The projects you advise on — read-only."
      />

      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Advisory access shows schedule and progress only. Commercial terms
          and workforce figures aren't part of the advisory scope and aren't
          returned to this role.
        </p>
      </div>

      <div className="relative w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={list.searchInput}
          onChange={(e) => list.setSearchInput(e.target.value)}
          placeholder="Search projects…"
          className="h-8 pl-8 text-xs"
        />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading projects…</div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">
          Couldn't load projects. {error.message}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          <FolderKanban className="h-5 w-5" />
          {list.total === 0 && !list.search
            ? "You aren't assigned to any projects yet — ask the Project Manager to add you as a consultant."
            : "No projects match your search."}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Project manager</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.code}>
                <TableCell>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="font-mono text-overline text-muted-foreground">
                    {p.code}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={p.status} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={p.progress} className="h-1.5 w-24" />
                    <span className="w-9 text-xs tabular-nums text-muted-foreground">
                      {p.progress}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-xs tabular-nums text-muted-foreground">
                  {formatDue(p.due)}
                </TableCell>
                <TableCell>
                  <span className={`text-xs capitalize ${riskToneClasses[p.risk] ?? "text-muted-foreground"}`}>
                    {p.risk}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.pm ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {!error && list.total > 0 && <DataTablePagination {...list} />}
    </div>
  );
}

ConsultantProjects.displayName = "ConsultantProjects";
