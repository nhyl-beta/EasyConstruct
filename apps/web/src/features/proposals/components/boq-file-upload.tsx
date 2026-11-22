// apps/web/src/features/proposals/components/boq-file-upload.tsx
//
// The Bill of Materials behind a proposal's estimated amount. The architect
// downloads an Excel template, fills it in outside the app, and uploads it
// back here — the file IS the source of truth for the amount (see
// apps/api/src/modules/design/proposals/boq-import.ts), never a number typed
// into this form. On pick, the file is sent to /proposals/boq/preview so the
// architect sees the computed total and any row errors before submitting;
// the server re-parses the same file independently at actual submit time,
// so nothing here is trusted on its own.
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/services/api.client";
import { saveBlob } from "@/lib/file-url";
import { formatCurrency } from "@/lib/format-currency";

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
  const input = useRef<HTMLInputElement>(null);

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
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => void pick(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          className="flex-1 justify-start gap-2 font-normal"
          onClick={() => input.current?.click()}
        >
          <FileSpreadsheet className="h-4 w-4 shrink-0" />
          <span className="truncate">{file ? file.name : "Upload the filled-in Bill of Materials (.xlsx)"}</span>
        </Button>
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
        <div className="space-y-1.5">
          <p className="text-sm">
            <span className="font-medium">{report.fileName}</span> — {report.totalRows} row
            {report.totalRows === 1 ? "" : "s"}:{" "}
            <span className="text-success-strong">{report.validRows} ready</span>
            {report.invalidRows > 0 && (
              <>
                , <span className="text-destructive-strong">{report.invalidRows} with errors</span>
              </>
            )}
            {boqReportIsReady(report) && (
              <>
                {" "}— estimated amount <span className="font-semibold">{formatCurrency(report.total)}</span>
              </>
            )}
          </p>

          {report.invalidRows > 0 && (
            <div className="max-h-48 overflow-auto rounded-lg border border-destructive/30">
              <ul className="divide-y divide-border text-xs">
                {report.rows
                  .filter((r) => r.errors.length > 0)
                  .map((r) => (
                    <li key={r.row} className="flex items-start gap-2 px-3 py-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-strong" />
                      <span>
                        Row {r.row}: {r.errors.join("; ")}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {boqReportIsReady(report) && (
            <p className="flex items-center gap-1.5 text-xs text-success-strong">
              <CheckCircle2 className="h-3.5 w-3.5" /> This sheet will be used as the estimated amount.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
