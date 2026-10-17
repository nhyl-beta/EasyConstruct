// The Reports tab on the project page (client demo change #10): Daily / Weekly / Monthly sub-tabs, a grid of
// the periods the project owes with filed ones in green and missing ones in red, and an Upload button that
// fills in the document type and the period.
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileUp, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadDocumentDialog, type UploadPreset } from "@/components/documents/upload-document-dialog";
import { useFieldDocuments } from "@/features/documents/hooks/use-field-documents";
import { cn } from "@/lib/utils";
import { REPORT_PERIODS, periodLabel, reportStatusRepository, type ReportCell, type ReportPeriod, type ReportStatus } from "../repositories/report-status.repository";

const TITLES: Record<ReportPeriod, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

export function ReportsTab({ projectCode, canUpload }: { projectCode: string; canUpload: boolean }) {
  const [status, setStatus] = useState<ReportStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<UploadPreset | null>(null);
  const { uploading, upload } = useFieldDocuments();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await reportStatusRepository.get(projectCode));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the reports");
    } finally {
      setLoading(false);
    }
  }, [projectCode]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Skeleton className="h-48 w-full" />;
  if (error || !status) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-destructive-strong">
        <span>Couldn&apos;t load the reports. {error}</span>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }
  if (status.applicable.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Reports are due while a project is in Construction or Closeout (or Design, for a design project). This project is not in one of those phases.</p>;
  }

  const open = (period: ReportPeriod, cell?: ReportCell) =>
    setPreset({ project: projectCode, type: status.documentTypes[period], reportPeriod: period, periodDate: cell?.start ?? status.today, title: `${status.documentTypes[period]} ${cell ? periodLabel(period, cell.start, cell.end) : status.today}` });

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Green means a report was filed for that period, red means it is missing. The project manager is reminded each morning about the report for the period that has just ended.
      </p>
      <Tabs defaultValue={status.applicable[0]}>
        <TabsList>
          {REPORT_PERIODS.filter((p) => status.applicable.includes(p)).map((p) => (
            <TabsTrigger key={p} value={p}>
              {TITLES[p]}
              <span className="ml-1.5 text-xs text-destructive-strong">{status.grids[p].filter((c) => !c.submitted).length || ""}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {REPORT_PERIODS.filter((p) => status.applicable.includes(p)).map((p) => (
          <TabsContent key={p} value={p} className="space-y-3">
            {canUpload && (
              <div>
                <Button size="sm" onClick={() => open(p)}>
                  <FileUp className="h-4 w-4" /> Upload {TITLES[p].toLowerCase()} report
                </Button>
              </div>
            )}
            {status.grids[p].length === 0 ? (
              <p className="text-sm text-muted-foreground">No {TITLES[p].toLowerCase()} report is due yet: the first period has not ended.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4" aria-label={`${TITLES[p]} reports`}>
                {status.grids[p].map((cell) => (
                  <li key={cell.start}>
                    <button
                      type="button"
                      disabled={!canUpload || cell.submitted}
                      onClick={() => open(p, cell)}
                      title={cell.submitted ? "A report was filed for this period" : canUpload ? "Missing: click to upload it" : "Missing"}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs",
                        cell.submitted ? "border-success/30 bg-success/10 text-success-strong" : "border-destructive/30 bg-destructive/10 text-destructive-strong",
                        canUpload && !cell.submitted && "hover:bg-destructive/15",
                      )}
                    >
                      {cell.submitted ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                      <span className="min-w-0">
                        <span className="block font-medium">{periodLabel(p, cell.start, cell.end)}</span>
                        <span className="block">{cell.submitted ? "Filed" : "Missing"}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <UploadDocumentDialog
        open={preset !== null}
        onOpenChange={(o) => !o && setPreset(null)}
        uploading={uploading}
        preset={preset ?? undefined}
        onSubmit={async (input) => {
          await upload(input);
          await load();
        }}
      />
    </div>
  );
}
