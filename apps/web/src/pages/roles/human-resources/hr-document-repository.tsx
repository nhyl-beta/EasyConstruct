// HR's document repository: every employee's files in one place, grouped by employee.
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { SubmittedFiles } from "@/components/shared/submitted-files";
import { EMPLOYEE_DOCUMENT_TYPES, listAllEmployeeDocuments, type RepositoryDocument } from "@/features/hr/hr-api";
import { usePagination } from "@/hooks/use-pagination";
import { fileTypeLabel } from "@/lib/file-type-label";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { PageHeader } from "@/pages/roles/shared/shared-hr";

const typeLabel = (v: string) => EMPLOYEE_DOCUMENT_TYPES.find((t) => t.value === v)?.label ?? v;

export default function HRDocumentRepository() {
  const [docs, setDocs] = useState<RepositoryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    listAllEmployeeDocuments()
      .then(setDocs)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load the documents"))
      .finally(() => setLoading(false));
  }, []);

  // The API sends them ordered by employee name, so a group is a run of the same employee.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byEmployee = new Map<number, RepositoryDocument[]>();
    for (const d of docs) {
      if (q && !`${d.employeeName} ${d.employeeCode} ${d.department} ${d.name}`.toLowerCase().includes(q)) continue;
      byEmployee.set(d.employeeId, [...(byEmployee.get(d.employeeId) ?? []), d]);
    }
    return [...byEmployee.values()];
  }, [docs, query]);
  const pagination = usePagination(groups, 10, query);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6">
      <PageHeader title="Documents" subtitle="Every employee's files, sorted by employee" />
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input className="pl-9" placeholder="Search by employee, ID, department or file…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search documents" />
      </div>
      {loading && <p className="text-sm text-muted-foreground">Loading documents…</p>}
      {error && <p role="alert" className="text-sm text-destructive-strong">{error}</p>}
      {!loading && !error && groups.length === 0 && <p className="text-sm text-muted-foreground">No documents found.</p>}
      <div className="space-y-4">
        {pagination.pageItems.map((rows) => {
          const first = rows[0]!;
          return (
            <Card key={first.employeeId}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {first.employeeName}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{first.employeeCode} · {first.department} · {rows.length} file{rows.length === 1 ? "" : "s"}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SubmittedFiles
                  emptyText="No documents."
                  files={rows.map((d) => ({
                    key: d.id,
                    name: d.name,
                    url: d.url,
                    meta: [typeLabel(d.docType), fileTypeLabel(d.name), d.uploadedBy, formatRelativeTime(d.createdAt)].filter(Boolean).join(" · "),
                  }))}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
      {pagination.total > 0 && <DataTablePagination {...pagination} />}
    </div>
  );
}

HRDocumentRepository.displayName = "HRDocumentRepository";
