// Data consistency checks (objectives fix 1.3): does what the system stores
// agree with the records it comes from? Read-only. A failing check lists the
// records that disagree and links to the first one; nothing is repaired here.
import { useCallback, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, ChevronDown, ChevronRight, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { getReconciliation, type ReconciliationCheck, type ReconciliationReport } from "./reconciliation.api";

function CheckRow({ check }: { check: ReconciliationCheck }) {
  const [open, setOpen] = useState(false);
  const failed = check.status === "fail";
  return (
    <li className="rounded-md border border-border/60">
      <button
        type="button"
        className="flex w-full items-start gap-2 p-3 text-left"
        onClick={() => failed && setOpen((v) => !v)}
        aria-expanded={failed ? open : undefined}
      >
        {failed ? (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive-strong" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-strong" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
            {check.title}
            <span className={failed ? "text-xs text-destructive-strong" : "text-xs text-success-strong"}>
              {failed ? `${check.mismatchCount} to look at` : "Pass"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {check.checked} checked. {check.basis}
          </div>
        </div>
        {failed && (open ? <ChevronDown className="mt-0.5 h-4 w-4" /> : <ChevronRight className="mt-0.5 h-4 w-4" />)}
      </button>
      {failed && open && (
        <ul className="space-y-1.5 border-t border-border/60 p-3 text-xs">
          {check.mismatches.map((m) => (
            <li key={`${m.subject}-${m.detail}`}>
              <Link to={m.link} className="font-medium text-primary-strong hover:underline">
                {m.subject}
              </Link>
              <span className="text-muted-foreground">: {m.detail}</span>
            </li>
          ))}
          {check.mismatchCount > check.mismatches.length && (
            <li className="text-muted-foreground">
              and {check.mismatchCount - check.mismatches.length} more. Run npm run reconcile on the server for the full list.
            </li>
          )}
        </ul>
      )}
      {failed && check.firstLink && !open && (
        <div className="border-t border-border/60 px-3 py-1.5 text-xs">
          <Link to={check.firstLink} className="text-primary-strong hover:underline">
            Open the first mismatch
          </Link>
        </div>
      )}
    </li>
  );
}

export function ReconciliationPanel() {
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getReconciliation());
    } catch (e) {
      setError(e instanceof Error ? e.message : "The checks could not run");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <SectionCard
      title="Data consistency"
      subtitle="Cross-checks that stored numbers agree with the records behind them. Read-only: nothing is changed or repaired."
      badge={report ? (report.passed ? "All checks pass" : `${report.failing} of ${report.total} need a look`) : undefined}
      actions={
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void run()}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> {report ? "Run again" : "Run checks"}
        </Button>
      }
    >
      {error && (
        <p role="alert" className="text-sm text-destructive-strong">
          Couldn't run the checks. {error}
        </p>
      )}
      {!report && !loading && !error && (
        <p className="text-sm text-muted-foreground">Run the checks to compare progress, budgets, payroll and linked records.</p>
      )}
      {loading && !report && <p className="text-sm text-muted-foreground">Running the checks…</p>}
      {report && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Last run {formatRelativeTime(report.ranAt)}.</p>
          <ul className="space-y-2">
            {report.checks.map((c) => (
              <CheckRow key={c.key} check={c} />
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
