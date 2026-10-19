import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiStrip } from "@/components/ui/kpi-strip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDesigns } from "@/features/designs/hooks/useDesigns";
import { PencilRuler, Plus, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { RevisionLink } from "@/features/revisions/components/RevisionLink";
import { useCurrentRevisions } from "@/features/revisions/hooks/useCurrentRevisions";

export default function ArchitectDesigns() {
  const navigate = useNavigate();
  const c = useDesigns();
  const currentRevisions = useCurrentRevisions("design");

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Designs"
        description="Central register of every design across all projects."
        actions={
          <Button
            size="sm"
           
            onClick={() => navigate("/designs/new")}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            New design
          </Button>
        }
      />

      <KpiStrip
        items={[
          {
            label: "Total designs",
            value: `${c.kpis.total}`,
            icon: PencilRuler,
          },
          {
            label: "In review",
            value: `${c.kpis.inReview}`,
            icon: PencilRuler,
            tone: "warn",
          },
          {
            label: "Approved",
            value: `${c.kpis.approved}`,
            icon: PencilRuler,
            tone: "good",
          },
          {
            label: "Revision needed",
            value: `${c.kpis.revisionNeeded}`,
            icon: PencilRuler,
            tone: "bad",
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={c.query}
            onChange={(e) => c.setQuery(e.target.value)}
            placeholder="Search designs, projects, architects…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={c.status} onValueChange={c.setStatus}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="In Review">In Review</SelectItem>
            <SelectItem value="Approved">Approved</SelectItem>
            <SelectItem value="Revision Needed">Revision Needed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {c.loading ? (
        <div className="text-sm text-muted-foreground">Loading designs…</div>
      ) : c.designs.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No designs match your filters.
        </div>
      ) : (
        <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Design</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Discipline</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Latest revision</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {c.designs.map((d) => (
              <TableRow
                key={d.id}
                className="cursor-pointer"
                onClick={() => navigate(`/designs/${d.id}`)}
              >
                <TableCell>
                  <div className="text-sm font-medium">{d.name}</div>
                  <div className="font-mono text-overline text-muted-foreground">
                    {d.code}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {d.projectCode}
                </TableCell>
                <TableCell className="text-xs">{d.discipline}</TableCell>
                <TableCell className="text-xs">
                  {d.version} · rev {d.revision}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {d.leadArchitect}
                </TableCell>
                <TableCell>
                  <RevisionLink itemType="design" itemId={d.id} current={currentRevisions[d.id]} stopPropagation />
                </TableCell>
                <TableCell>
                  <StatusBadge status={d.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3">
          <DataTablePagination {...c.pagination} />
        </div>
        </>
      )}
    </div>
  );
}

ArchitectDesigns.displayName = "ArchitectDesigns";
