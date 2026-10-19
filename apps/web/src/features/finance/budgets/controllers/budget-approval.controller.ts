import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/services/api.client";
import { useAuth } from "@/auth/auth-context";
import type { Budget } from "../types/budget.types";
import type { ApprovalDecision, ApprovalStage, BudgetApprovalStep } from "../types/budget-approval.types";
import { APPROVAL_STAGES } from "../types/budget-approval.types";

export const useBudgetApprovalController = (budgets: Budget[], onDecided?: () => void) => {
  const { user } = useAuth();
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>("");
  const [steps, setSteps] = useState<BudgetApprovalStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!selectedBudgetId && budgets.length) {
      setSelectedBudgetId(String(budgets[0].id));
    }
  }, [budgets, selectedBudgetId]);

  const fetchSteps = useCallback((budgetId: string) => {
    if (!budgetId) return;
    setLoading(true);
    // Was raw fetch() with no Authorization header — /api/finance now
    // requires a token (see app.ts), so this always 401'd.
    apiClient
      .get(`/finance/budget-approval-steps?budgetId=${budgetId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((json: any) => setSteps(json.data ?? []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSteps(selectedBudgetId);
  }, [selectedBudgetId, fetchSteps]);

  const selectedBudget = budgets.find((b) => String(b.id) === selectedBudgetId);

  // The budget's own `status` (set by budget-approval-steps/service.ts on
  // every decision) IS the current pending stage — deriving it from the
  // step history instead ("last decided step's own stage") meant that once
  // a stage was approved, `current` fell back to that SAME stage forever,
  // so Approve never advanced past the first click.
  const current: string = selectedBudget?.status ?? "draft";

  const decide = async (decision: ApprovalDecision) => {
    if (!selectedBudget) return;
    setSubmitting(true);
    try {
      await apiClient.post("/finance/budget-approval-steps/decide", {
        budgetId: selectedBudget.id,
        stage: current as ApprovalStage,
        decision,
        actor: user?.name ?? "unknown",
        comment: comment || undefined,
      });
      setComment("");
      fetchSteps(selectedBudgetId);
      // The budget's own status just changed — the parent's budget list
      // (and this hook's `current`, derived from it) needs the fresh row.
      onDecided?.();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return {
    budgets,
    selectedBudgetId,
    setSelectedBudgetId,
    selectedBudget,
    steps,
    loading,
    current,
    stages: APPROVAL_STAGES,
    comment,
    setComment,
    submitting,
    decide,
  };
};