// Search across archived projects and the documents filed under them. The
// server already limits what each role may list (a PM sees their own projects,
// an Architect the projects they are staffed on), so this page only filters
// what came back — it never widens access.
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Archive, ExternalLink, Search } from "lucide-react";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { documentsRepository, type DocumentRecord } from "@/features/documents/repositories/documents.repository";
import { ProjectRepository } from "@/features/projects/repositories/project.repository";
import type { Project } from "@/features/projects/types/project.types";
import { openFileUrl } from "@/lib/file-url";

const matches = (q: string, ...fields: Array<string | null | undefined>) => fields.some((f) => (f ?? "").toLowerCase().includes(q));

export default function SharedArchiveSearchPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([ProjectRepository.listPage({ page: 1, pageSize: 100, status: "Archived" }), documentsRepository.listByProject()])
      .then(([page, docs]) => {
        if (!active) return;
        setProjects(page.items);
        setDocuments(docs.data);
      })
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : "Could not load the archive"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const archivedCodes = useMemo(() => new Set(projects.map((p) => p.code)), [projects]);
  const q = query.trim().toLowerCase();

  const projectHits = useMemo(
    () => projects.filter((p) => !q || matches(q, p.name, p.code, p.client, p.location, p.projectType, p.pm, p.description)),
    [projects, q],
  );
  const pgProjects = usePagination(projectHits, 10, q);
  const documentHits = useMemo(
    () =>
      documents.filter(
        (d) => archivedCodes.has(d.project) && (!q || matches(q, d.title, d.documentId, d.type, d.project, d.stage)),
      ),
    [documents, archivedCodes, q],
  );
  const pgDocs = usePagination(documentHits, 10, q);

  return (
    <PageContainer>
      <PageHeader title="Archive search" description="Find completed and archived projects and the documents filed under them." />
      <PageContent className="space-y-6 p-4 md:p-8">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Project name, code, client, location, document title or type…"
            className="pl-9"
            aria-label="Search archive"
          />
        </div>

        {error && <p role="alert" className="text-sm text-destructive-strong">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading the archive…</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SectionCard title="Archived projects" badge={`${projectHits.length}`} actions={<Archive className="h-4 w-4 text-muted-foreground" aria-hidden />}>
              {projectHits.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">{projects.length === 0 ? "No archived projects yet." : "No archived project matches."}</p>
              ) : (
                <ul className="divide-y">
                  {pgProjects.pageItems.map((p) => (
                    <li key={p.code} className="py-2.5 text-sm">
                      <Link to={`/projects/${p.id}`} className="font-medium text-primary-strong hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {p.code} · {p.client || "No client"} · {p.location || "No location"}
                      </div>
                    </li>
                  ))}
                  <div className="pt-2">
                    <DataTablePagination {...pgProjects} compact />
                  </div>
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Documents in archived projects" badge={`${documentHits.length}`}>
              {documentHits.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">No document matches.</p>
              ) : (
                <ul className="divide-y">
                  {pgDocs.pageItems.map((d) => (
                    <li key={d.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{d.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.project} · {d.type} · {d.version}
                        </div>
                      </div>
                      {d.fileUrl && (
                        <button type="button" className="inline-flex shrink-0 items-center gap-1 text-xs text-primary-strong hover:underline" onClick={() => void openFileUrl(d.fileUrl)}>
                          Open <ExternalLink className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                    </li>
                  ))}
                  <div className="pt-2">
                    <DataTablePagination {...pgDocs} compact />
                  </div>
                </ul>
              )}
            </SectionCard>
          </div>
        )}
      </PageContent>
    </PageContainer>
  );
}

SharedArchiveSearchPage.displayName = "SharedArchiveSearchPage";
