import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useNavigate } from "react-router";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";
import { useArchitectProjects } from "@/features/designs/hooks/useArchitectProjects";
import { formatDue } from "@/features/projects/lib/project-format";

export default function ArchitectProjects() {
  const navigate = useNavigate();
  const c = useArchitectProjects();
  const pg = usePagination(c.projects, 10);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Projects"
        description="Projects with active design work. Read-only — project setup and edits stay with Project Management."
      />

      <div className="relative w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={c.query}
          onChange={(e) => c.setQuery(e.target.value)}
          placeholder="Search projects…"
          className="h-8 pl-8 text-xs"
        />
      </div>

      {c.loading ? (
        <div className="text-sm text-muted-foreground">Loading projects…</div>
      ) : c.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive-strong">
          <span>Couldn't load your projects. {c.error}</span>
          <Button size="sm" variant="outline" onClick={c.reload}>
            Retry
          </Button>
        </div>
      ) : c.projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No projects have linked designs yet.
        </div>
      ) : (
        // table-fixed with percentage widths summing to 100% lets long project
        // names/codes wrap instead of forcing the table wider than its
        // container (which the default auto-layout table did, producing a
        // horizontal scrollbar).
        <div className="overflow-hidden rounded-2xl border">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">Project</TableHead>
                <TableHead className="w-[14%]">Status</TableHead>
                <TableHead className="w-[14%]">Risk</TableHead>
                <TableHead className="w-[16%]">Progress</TableHead>
                <TableHead className="w-[14%]">Due</TableHead>
                <TableHead className="w-[12%] text-right">Designs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pg.pageItems.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/designs?projectCode=${p.code}`)}>
                  <TableCell>
                    <div className="text-sm font-medium break-words">{p.name}</div>
                    <div className="font-mono text-overline text-muted-foreground">{p.code}</div>
                  </TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell><StatusBadge status={p.risk} /></TableCell>
                  <TableCell>
                    <Progress value={p.progress} className="h-1.5" />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDue(p.due)}</TableCell>
                  <TableCell className="text-right text-sm">{p.designCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="pt-2">
            <DataTablePagination {...pg} />
          </div>
        </div>
      )}
    </div>
  );
}

ArchitectProjects.displayName = "ArchitectProjects";