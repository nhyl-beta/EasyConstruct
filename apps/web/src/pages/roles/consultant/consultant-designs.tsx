import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { PageHeader } from "@/components/refine-ui/views/page-header";
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
import { PencilRuler, Search } from "lucide-react";
import { useState } from "react";
import { DesignDetailDialog } from "@/features/designs/components/DesignDetailDialog";
import type { Design } from "@/features/designs/types/design.types";

// Consultant's advisory remit covers the designs behind the proposals they
// review, but the role had no designs screen at all — the register existed
// only under Architect, behind a page with a "New design" action. This is the
// same /api/designs data (the endpoint is authenticate-only, no role filter)
// rendered read-only: no create, no row navigation into the editable detail
// page, and the assigned engineers surfaced since that is the review contact.
// A row opens a read-only detail dialog (description + attached files).
export default function ConsultantDesigns() {
  const c = useDesigns();
  const [selected, setSelected] = useState<Design | null>(null);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Designs"
        description="Read-only register of designs across all projects, for advisory review."
      />

      <KpiStrip
        items={[
          { label: "Total designs", value: `${c.kpis.total}`, icon: PencilRuler },
          { label: "In review", value: `${c.kpis.inReview}`, icon: PencilRuler, tone: "warn" },
          { label: "Approved", value: `${c.kpis.approved}`, icon: PencilRuler, tone: "good" },
          { label: "Revision needed", value: `${c.kpis.revisionNeeded}`, icon: PencilRuler, tone: "bad" },
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
              <TableHead>Lead architect</TableHead>
              <TableHead>Engineers</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {c.designs.map((d) => (
              <TableRow
                key={d.id}
                tabIndex={0}
                role="button"
                aria-label={`Open design ${d.name}`}
                className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSelected(d)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(d);
                  }
                }}
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
                <TableCell className="text-xs text-muted-foreground">
                  {d.assignedEngineers?.length
                    ? d.assignedEngineers.map((e) => e.userName).join(", ")
                    : "—"}
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

      <DesignDetailDialog design={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}

ConsultantDesigns.displayName = "ConsultantDesigns";
