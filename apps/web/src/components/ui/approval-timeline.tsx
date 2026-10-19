import { CheckCircle2, XCircle, RotateCcw, Clock } from "lucide-react";
import type { BudgetApprovalStep } from "@/features/finance/budgets/types/budget-approval.types";

const STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  "pending-review": "Pending Review",
  "finance-review": "Finance Review",
  "manager-review": "Manager Review",
  approved: "Approved",
};

const decisionIcon: Record<string, typeof CheckCircle2> = {
  approved: CheckCircle2,
  rejected: XCircle,
  returned: RotateCcw,
};

// "returned" is text-warning-strong, not text-warning-foreground — see the note in
// project-status.ts's RISK_CLASS; the other two tones here are already
// standalone-safe tokens, which is what made this one stand out.
const decisionTone: Record<string, string> = {
  approved: "text-success-strong",
  rejected: "text-destructive-strong",
  returned: "text-warning-strong",
};

export function ApprovalTimeline({ steps }: { steps: BudgetApprovalStep[] }) {
  if (!steps.length) {
    return <div className="text-xs text-muted-foreground">No decisions recorded yet.</div>;
  }

  const ordered = [...steps].sort((a, b) => {
    const at = a.decidedAt ? new Date(a.decidedAt).getTime() : 0;
    const bt = b.decidedAt ? new Date(b.decidedAt).getTime() : 0;
    return bt - at;
  });

  return (
    <ol className="space-y-3">
      {ordered.map((s) => {
        const Icon = s.decision ? decisionIcon[s.decision] ?? Clock : Clock;
        return (
          <li key={s.id} className="flex gap-3 rounded-xl border p-3">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.decision ? decisionTone[s.decision] : "text-muted-foreground"}`} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {STAGE_LABELS[s.stage] ?? s.stage}
                {s.decision && <span className="capitalize text-muted-foreground"> · {s.decision}</span>}
              </div>
              {s.comment && <p className="mt-1 text-xs text-muted-foreground">{s.comment}</p>}
              <div className="mt-1 flex items-center gap-3 text-overline text-muted-foreground">
                {s.actor && <span>{s.actor}</span>}
                {s.decidedAt && <span>{new Date(s.decidedAt).toLocaleString()}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}