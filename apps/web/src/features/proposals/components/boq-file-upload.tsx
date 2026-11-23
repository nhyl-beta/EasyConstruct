// apps/web/src/features/proposals/components/boq-file-upload.tsx
//
// The Bill of Materials behind a proposal's estimated amount. The architect
// downloads an Excel template, fills it in outside the app, and uploads it
// back — the file IS the source of truth for the amount and the material
// list (see apps/api/src/modules/design/proposals/boq-import.ts); neither
// can be typed or edited here. On pick, the file is sent to
// /proposals/boq/preview so the architect sees the computed total and every
// row before submitting; the server re-parses the same file independently
// at actual submit time, so nothing here is trusted on its own.
import { useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { apiClient } from "@/services/api.client";
import { saveBlob } from "@/lib/file-url";
import { formatCurrency } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

export interface BoqRow {
  row: number;
  description: string;
  quantity: number | null;
  unit: string | null;
  unitCost: number | null;
  subtotal: number;
  errors: string[];
}

export interface BoqReport {
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: BoqRow[];
  total: number;
}

/** True once the uploaded sheet is usable as the proposal's amount. */
export const boqReportIsReady = (report: BoqReport | null): report is BoqReport =>
  !!report && report.validRows > 0 && report.invalidRows === 0;

export function BoqFileUpload({
  onChange,
}: {
  /** Fires on every file pick/clear and after each preview; `null` report means not yet checked, failed, or cleared. */
  onChange: (file: File | null, report: BoqReport | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<BoqReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const pg = usePagination(report?.rows ?? [], 10, report?.fileName);

  const downloadTemplate = async () => {
    try {
      saveBlob(await apiClient.getBlob("/proposals/boq-template"), "bill-of-materials-template.xlsx");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the template");
    }
  };

  const pick = async (picked: File | null) => {
    setFile(picked);
    setReport(null);
    setError(null);
    onChange(picked, null);
    if (!picked) return;

    setChecking(true);
    try {
      const form = new FormData();
      form.append("file", picked);
      const json = (await apiClient.postFormData("/proposals/boq/preview", form)) as { data: BoqReport };
      setReport(json.data);
      onChange(picked, json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the sheet");
      onChange(picked, null);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="flex h-9 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm hover:border-primary/40">
          <Upload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-muted-foreground">
            {file ? file.name : "Upload the filled-in Bill of Materials (.xlsx)"}
          </span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={() => void downloadTemplate()}>
          <Download className="h-4 w-4" /> Template
        </Button>
      </div>

      {checking && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the sheet…
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-strong">
          {error}
        </p>
      )}

      {report && (
        <div className="rounded-lg border border-border">
          <Collapsible open={listOpen} onOpenChange={setListOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <FileSpreadsheet className="h-4 w-4 shrink-0" />
                  {report.fileName} — {report.totalRows} material{report.totalRows === 1 ? "" : "s"}
                  {report.invalidRows > 0 && (
                    <span className="text-destructive-strong"> ({report.invalidRows} with errors)</span>
                  )}
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", listOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="max-h-96 overflow-auto border-t border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/60 text-left uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Unit</th>
                      <th className="px-3 py-2">Rate</th>
                      <th className="px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pg.pageItems.map((r) => (
                      <tr key={r.row} className={cn("border-t border-border align-top", r.errors.length > 0 && "bg-destructive/5")}>
                        <td className="px-3 py-2">{r.description || "—"}</td>
                        <td className="px-3 py-2 tabular-nums">{r.quantity ?? "—"}</td>
                        <td className="px-3 py-2">{r.unit ?? "—"}</td>
                        <td className="px-3 py-2 tabular-nums">{r.unitCost != null ? formatCurrency(r.unitCost) : "—"}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {r.errors.length > 0 ? (
                            <span className="text-destructive-strong">{r.errors.join("; ")}</span>
                          ) : (
                            formatCurrency(r.subtotal)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border px-3 py-2">
                <DataTablePagination {...pg} compact />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className={cn("flex items-center justify-between px-3 py-2 text-sm", listOpen && "border-t border-border")}>
            <span className="text-muted-foreground">Estimated amount (computed from the file above)</span>
            <span className="font-semibold">{boqReportIsReady(report) ? formatCurrency(report.total) : "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
