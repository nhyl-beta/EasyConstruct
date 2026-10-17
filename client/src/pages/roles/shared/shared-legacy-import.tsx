// Bulk import of existing (paper-era) documents: a CSV manifest says which
// file belongs to which project and what it is; the files are picked alongside.
// Every row goes through the same POST /documents/upload an ordinary upload
// uses, so access scoping, file-type limits and the closed-project guard apply
// unchanged — a row the server refuses is reported, never silently skipped.
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, FileUp, XCircle } from "lucide-react";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { useDocumentTypes } from "@/features/document-types/hooks/use-document-types";
import { documentsRepository } from "@/features/documents/repositories/documents.repository";
import { ProjectRepository } from "@/features/projects/repositories/project.repository";
import { parseCsv } from "@/lib/parse-csv";
import { saveBlob } from "@/lib/file-url";

const HEADERS = ["project", "title", "type", "filename"] as const;

type RowState = "ready" | "invalid" | "importing" | "done" | "failed";
interface ImportRow {
  line: number;
  project: string;
  title: string;
  type: string;
  filename: string;
  file: File | null;
  state: RowState;
  message: string;
}

export default function SharedLegacyImportPage() {
  const { types: documentTypes } = useDocumentTypes();
  const typeNames = documentTypes.map((t) => t.name);
  const manifestRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);

  const readyCount = rows.filter((r) => r.state === "ready").length;
  const doneCount = rows.filter((r) => r.state === "done").length;

  const downloadTemplate = () =>
    saveBlob(
      new Blob([`${HEADERS.join(",")}\r\nGTSP-00,Signed construction contract,Contract,contract-signed.pdf\r\n`], { type: "text/csv;charset=utf-8" }),
      "legacy-import-template.csv",
    );

  async function check() {
    setProblem(null);
    setRows([]);
    const manifest = manifestRef.current?.files?.[0];
    if (!manifest) {
      setProblem("Choose the CSV manifest first.");
      return;
    }
    setChecking(true);
    try {
      const table = parseCsv(await manifest.text());
      const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
      const missing = HEADERS.filter((h) => !header.includes(h));
      if (missing.length > 0) {
        setProblem(`The manifest is missing column(s): ${missing.join(", ")}. Download the template for the expected layout.`);
        return;
      }
      const col = (name: (typeof HEADERS)[number]) => header.indexOf(name);
      const files = new Map(Array.from(filesRef.current?.files ?? []).map((f) => [f.name.toLowerCase(), f]));
      const projects = new Set((await ProjectRepository.list()).map((p) => p.code));
      const seen = new Set<string>();

      const checked = table.slice(1).map((cells, i): ImportRow => {
        const get = (name: (typeof HEADERS)[number]) => (cells[col(name)] ?? "").trim();
        const row = { line: i + 2, project: get("project"), title: get("title"), type: get("type"), filename: get("filename") };
        const file = files.get(row.filename.toLowerCase()) ?? null;
        const fail = (message: string): ImportRow => ({ ...row, file, state: "invalid", message });
        if (!row.project || !row.title || !row.type || !row.filename) return fail("Every column is required.");
        if (!projects.has(row.project)) return fail(`No project "${row.project}" that you can see.`);
        if (!typeNames.some((n) => n.toLowerCase() === row.type.toLowerCase())) return fail(`Unknown type "${row.type}".`);
        if (!file) return fail(`File "${row.filename}" was not selected.`);
        const key = `${row.project}|${row.filename.toLowerCase()}`;
        if (seen.has(key)) return fail("Listed twice for the same project.");
        seen.add(key);
        return { ...row, file, state: "ready", message: "Ready" };
      });
      if (checked.length === 0) setProblem("The manifest has no data rows.");
      setRows(checked);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not read the manifest.");
    } finally {
      setChecking(false);
    }
  }

  async function runImport() {
    setRunning(true);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      if (r.state !== "ready" || !r.file) continue;
      const patch = (p: Partial<ImportRow>) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, ...p } : x)));
      patch({ state: "importing", message: "Uploading…" });
      try {
        await documentsRepository.upload({ file: r.file, project: r.project, type: r.type, title: r.title });
        patch({ state: "done", message: "Imported" });
      } catch (e) {
        patch({ state: "failed", message: e instanceof Error ? e.message : "Upload failed" });
      }
    }
    setRunning(false);
  }

  const summary = useMemo(() => {
    const failed = rows.filter((r) => r.state === "failed" || r.state === "invalid").length;
    return `${rows.length} row${rows.length === 1 ? "" : "s"} · ${doneCount} imported · ${failed} need attention`;
  }, [rows, doneCount]);
  const pg = usePagination(rows, 20);

  return (
    <PageContainer>
      <PageHeader title="Legacy import" description="Bring existing documents into the system in bulk, from a CSV manifest and the files themselves." />
      <PageContent className="space-y-6 p-4 md:p-8">
        <SectionCard title="1. Choose the manifest and files" subtitle="One manifest row per file: project code, title, document type and the file's name.">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              Manifest (.csv)
              <Input ref={manifestRef} type="file" accept=".csv,text/csv" />
            </label>
            <label className="grid gap-1.5 text-sm">
              Files
              <Input ref={filesRef} type="file" multiple />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void check()} disabled={checking || running}>
              <FileUp className="mr-1 h-4 w-4" /> {checking ? "Checking…" : "Check manifest"}
            </Button>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="mr-1 h-4 w-4" /> Download template
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Allowed types: {typeNames.join(", ")}. Documents can only be added to projects that are still open to changes; a closed or archived project will report a failure for its rows.
          </p>
          {problem && <p role="alert" className="mt-3 text-sm text-destructive-strong">{problem}</p>}
        </SectionCard>

        {rows.length > 0 && (
          <SectionCard
            title="2. Review and import"
            subtitle={summary}
            actions={
              <Button size="sm" disabled={readyCount === 0 || running} onClick={() => void runImport()}>
                {running ? "Importing…" : `Import ${readyCount} file${readyCount === 1 ? "" : "s"}`}
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-overline uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Line</th>
                    <th className="py-2 pr-3 font-medium">Project</th>
                    <th className="py-2 pr-3 font-medium">Title</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">File</th>
                    <th className="py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {pg.pageItems.map((r) => (
                    <tr key={r.line} className="border-b last:border-0">
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">{r.line}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.project}</td>
                      <td className="py-2 pr-3">{r.title}</td>
                      <td className="py-2 pr-3">{r.type}</td>
                      <td className="py-2 pr-3 text-xs">{r.filename}</td>
                      <td className="py-2">
                        <span
                          className={`inline-flex items-center gap-1 text-xs ${
                            r.state === "done" ? "text-success-strong" : r.state === "invalid" || r.state === "failed" ? "text-destructive-strong" : "text-muted-foreground"
                          }`}
                        >
                          {r.state === "done" && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
                          {(r.state === "invalid" || r.state === "failed") && <XCircle className="h-3.5 w-3.5" aria-hidden />}
                          {r.message}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pt-2">
                <DataTablePagination {...pg} />
              </div>
            </div>
          </SectionCard>
        )}
      </PageContent>
    </PageContainer>
  );
}

SharedLegacyImportPage.displayName = "SharedLegacyImportPage";
