import {
  APPROVAL_STAGES,
  type BudgetApprovalStep,
} from "@/features/finance/budgets/types/budget-approval.types";
import { cn } from "@/lib/utils";
import { Check, Circle, X } from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  "pending-review": "Pending Review",
  "finance-review": "Finance Review",
  "manager-review": "Manager Review",
  approved: "Approved",
};

interface ApprovalStepperProps {
  current: string;
  steps: BudgetApprovalStep[];
}

export function ApprovalStepper({ current, steps }: ApprovalStepperProps) {
  const isRejected = current === "rejected";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentIdx = APPROVAL_STAGES.indexOf(current as any);

  return (
    <ol className="grid gap-3 md:grid-cols-5">
      {APPROVAL_STAGES.map((stage, i) => {
        const stepRecord = [...steps]
          .reverse()
          .find((s) => s.stage === stage && s.decision);
        const isDone = isRejected
          ? false
          : i < currentIdx || (stage === "approved" && current === "approved");
        const isCurrent = !isRejected && stage === current;
        const isFailed = isRejected && stepRecord?.decision === "rejected";

        return (
          <li
            key={stage}
            className={cn(
              "rounded-xl border p-3",
              isCurrent && "border-primary/50 bg-primary/5",
              isDone && "border-success/40 bg-success/5",
              isFailed && "border-destructive/40 bg-destructive/5",
            )}
          >
            <div className="flex items-center gap-2">
              {isDone ? (
                <Check className="h-3.5 w-3.5 text-success-strong" />
              ) : isFailed ? (
                <X className="h-3.5 w-3.5 text-destructive-strong" />
              ) : (
                <Circle
                  className={cn(
                    "h-3.5 w-3.5",
                    isCurrent ? "text-primary-strong" : "text-muted-foreground",
                  )}
                />
              )}
              <div className="text-overline uppercase text-muted-foreground">
                Step {i + 1}
              </div>
            </div>
            <div className="mt-1 text-sm font-semibold">
              {STAGE_LABELS[stage]}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
