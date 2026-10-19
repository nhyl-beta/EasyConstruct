import { ValidationError } from "../../utils/errors.js";
import * as repo from "./repository.js";
import type {
  ApprovalStage,
  BudgetApprovalFilters,
  DecideBudgetApprovalInput,
} from "./types.js";
import { APPROVAL_STAGES } from "./types.js";

export const getAll = async (filters: BudgetApprovalFilters) => {
  return filters.budgetId
    ? repo.findByBudgetId(filters.budgetId)
    : repo.findAll();
};

const nextStage = (stage: string, decision: string): ApprovalStage | "rejected" => {
  if (decision === "rejected") return "rejected";
  if (decision === "returned") return "draft";
  const idx = APPROVAL_STAGES.indexOf(stage as ApprovalStage);
  if (idx === -1) throw new ValidationError(`Unknown stage: ${stage}`);
  const next = APPROVAL_STAGES[idx + 1];
  return next ?? "approved";
};

export const decide = async (input: DecideBudgetApprovalInput) => {
  const step = await repo.insertStep(input);
  const resultingStatus = nextStage(input.stage, input.decision);
  await repo.setBudgetStatus(input.budgetId, resultingStatus);
  return { step, resultingStatus };
};
