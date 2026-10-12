// Rule-based validation summary for a proposal (objectives fix 3.3). Shared by
// the Consultant review, the Architect register and the read-only register so
// all three show the same checks and the basis each warning rests on.
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DecisionSupportLabel } from "@/components/shared/decision-support-label";

/** Mirrors VALIDATION_VERSION in server/src/proposals/validation.ts. */
export const VALIDATION_VERSION = 2;

export interface ParsedValidation {
  passed: boolean;
  issues: string[];
  warnings: string[];
  checkedAt?: string;
  version?: number;
  basis?: string[];
}

export function parseValidation(raw: string | null | undefined): ParsedValidation | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ParsedValidation;
    return Array.isArray(parsed.issues) && Array.isArray(parsed.warnings) ? parsed : null;
  } catch {
    return null;
  }
}

/** True when a stored result predates the current checks and should be recomputed. */
export const isStaleValidation = (raw: string | null | undefined): boolean => {
  const parsed = parseValidation(raw);
  return parsed != null && (parsed.version ?? 1) < VALIDATION_VERSION;
};

export function ProposalValidationPanel({
  raw,
  emptyText = "No validation summary yet.",
  onRerun,
  rerunning,
}: {
  raw: string | null | undefined;
  emptyText?: string;
  /** Recompute with the current checks (Consultant, Architect and PM may). */
  onRerun?: () => void;
  rerunning?: boolean;
}) {
  const parsed = parseValidation(raw);
  if (!raw) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  if (!parsed) return <p className="whitespace-pre-wrap text-sm leading-7">{raw}</p>;

  const stale = (parsed.version ?? 1) < VALIDATION_VERSION;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`font-medium ${parsed.passed ? "text-success-strong" : "text-destructive-strong"}`}>
          {parsed.passed ? "No blocking issues found" : "Blocking issues found"}
        </div>
        <DecisionSupportLabel />
      </div>
      {parsed.issues.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Issues</p>
          <ul className="list-inside list-disc space-y-0.5 text-destructive-strong">
            {parsed.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}
      {parsed.warnings.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Warnings</p>
          <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
            {parsed.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {parsed.issues.length === 0 && parsed.warnings.length === 0 && (
        <p className="text-muted-foreground">No issues or warnings raised.</p>
      )}
      {parsed.basis && parsed.basis.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">What this was checked against</p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
            {parsed.basis.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-overline text-muted-foreground">
        {parsed.checkedAt && <span>Checked {new Date(parsed.checkedAt).toLocaleString()}.</span>}
        {stale && <span>Made with an older set of checks.</span>}
        <span>A reviewer makes the decision.</span>
        {onRerun && stale && (
          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-overline" disabled={rerunning} onClick={onRerun}>
            <RefreshCw className={`h-3 w-3 ${rerunning ? "animate-spin" : ""}`} /> Re-run checks
          </Button>
        )}
      </div>
    </div>
  );
}
