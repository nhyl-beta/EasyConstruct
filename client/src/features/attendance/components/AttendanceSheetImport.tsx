// client/src/features/attendance/components/AttendanceSheetImport.tsx
//
// Site Personnel upload an Excel sheet of the workers who were on site. The
// file is checked by the server first (POST /attendance/import/preview) and
// shown here row by row with the reason for each rejected row; nothing is
// saved until "Import" is pressed, and only the valid rows are imported.
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SectionCard } from "@/components/ui/section-card";
import { apiClient } from "@/services/api.client";
import { saveBlob } from "@/lib/file-url";

interface SheetRow {
  row: number;
  workerId: string;
  workerName: string | null;
  date: string | null;
  timeIn: string | null;
  timeOut: string | null;
  hours: string | null;
  status: string;
  remarks: string | null;
  errors: string[];
}

interface SheetReport {
  projectCode: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: SheetRow[];
}

interface ImportResult {
  imported: number;
  skipped: number;
  totalRows: number;
}

export function AttendanceSheetImport({
  projects,
  onImported,
}: {
  /** The projects the caller may upload for (staffed, in Construction/Closeout). */
  projects: { code: string; name: string }[];
  onImported?: () => void;
}) {
  const [projectCode, setProjectCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<SheetReport | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"check" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const pg = usePagination(report?.rows ?? [], 15);

  const form = () => {
    const data = new FormData();
    data.append("file", file!);
    data.append("projectCode", projectCode);
    return data;
  };

  const reset = () => {
    setFile(null);
    setReport(null);
    setError(null);
    if (input.current) input.current.value = "";
  };

  const downloadTemplate = async () => {
    setError(null);
    try {
      saveBlob(await apiClient.getBlob("/attendance/import/template"), "attendance-template.xlsx");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the template");
    }
  };

  const check = async () => {
    if (!file || !projectCode) return;
    setBusy("check");
    setError(null);
    setResult(null);
    setReport(null);
    try {
      const json = (await apiClient.postFormData("/attendance/import/preview", form())) as { data: SheetReport };
      setReport(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check the sheet");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (!file || !projectCode) return;
    setBusy("import");
    setError(null);
    try {
      const json = (await apiClient.postFormData("/attendance/import/commit", form())) as { data: ImportResult };
      setResult(json.data);
      reset();
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard
      title="Upload attendance sheet"
      subtitle="Record several workers' attendance for a site from an Excel sheet"
      actions={
        <Button variant="outline" size="sm" onClick={() => void downloadTemplate()}>
          <Download className="h-4 w-4" /> Template
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Project</label>
            <SearchableSelect
              value={projectCode || undefined}
              onValueChange={(v) => {
                setProjectCode(v);
                setReport(null);
                setResult(null);
              }}
              options={projects.map((p) => ({ value: p.code, label: `${p.code} · ${p.name}` }))}
              placeholder="Select a project"
              searchPlaceholder="Search projects…"
              emptyText="You are not staffed on any project as site personnel"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Excel sheet (.xlsx)</label>
            <input
              ref={input}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setReport(null);
                setResult(null);
                setError(null);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2 font-normal"
              onClick={() => input.current?.click()}
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span className="truncate">{file ? file.name : "Choose a file…"}</span>
            </Button>
          </div>
        </div>

        <Button
         
          disabled={!file || !projectCode || busy !== null}
          onClick={() => void check()}
        >
          {busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy === "check" ? "Checking…" : "Check sheet"}
        </Button>

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-strong">
            {error}
          </p>
        )}

        {result && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success-strong">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            Imported {result.imported} record{result.imported === 1 ? "" : "s"}
            {result.skipped > 0 ? ` (${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped)` : ""}. They are
            Pending until HR verifies them.
          </p>
        )}

        {report && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p>
                <span className="font-medium">{report.fileName}</span> — {report.totalRows} row
                {report.totalRows === 1 ? "" : "s"}:{" "}
                <span className="text-success-strong">{report.validRows} ready</span>
                {report.invalidRows > 0 && (
                  <>
                    , <span className="text-destructive-strong">{report.invalidRows} with errors</span>
                  </>
                )}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={reset} disabled={busy !== null}>
                  Discard
                </Button>
                <Button
                  size="sm"
                 
                  disabled={report.validRows === 0 || busy !== null}
                  onClick={() => void confirm()}
                >
                  {busy === "import" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {busy === "import"
                    ? "Importing…"
                    : report.invalidRows > 0
                      ? `Import ${report.validRows} valid row${report.validRows === 1 ? "" : "s"}`
                      : `Import ${report.validRows} row${report.validRows === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>

            {report.invalidRows > 0 && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-strong" />
                Rows with errors are skipped. Fix them in the sheet and upload again to add them.
              </p>
            )}

            <div className="max-h-96 overflow-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60 text-left uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Worker</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">In</th>
                    <th className="px-3 py-2">Out</th>
                    <th className="px-3 py-2">Hours</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {pg.pageItems.map((r) => (
                    <tr
                      key={r.row}
                      className={`border-t border-border align-top ${r.errors.length > 0 ? "bg-destructive/5" : ""}`}
                    >
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.row}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.workerName ?? "—"}</div>
                        <div className="font-mono text-overline text-muted-foreground">{r.workerId || "—"}</div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.date ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{r.timeIn ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{r.timeOut ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{r.hours ?? "—"}</td>
                      <td className="px-3 py-2">{r.status}</td>
                      <td className="px-3 py-2">
                        {r.errors.length === 0 ? (
                          <span className="flex items-center gap-1 text-success-strong">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                          </span>
                        ) : (
                          <ul className="space-y-0.5 text-destructive-strong">
                            {r.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pt-2">
                <DataTablePagination {...pg} />
              </div>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
