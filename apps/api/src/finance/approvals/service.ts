import { approvalsRepository, type Reader } from "./repository.js";
import { mergePending } from "./merge.js";

export const approvalsService = {
  async list(limit: number, now: Date = new Date(), exec?: Reader) {
    const [expenses, payroll, budgets, purchaseRequests] = await Promise.all([
      approvalsRepository.pendingExpenses(exec),
      approvalsRepository.pendingPayroll(exec),
      approvalsRepository.pendingBudgets(exec),
      approvalsRepository.pendingPurchaseRequests(exec),
    ]);
    return mergePending([expenses, payroll, budgets, purchaseRequests], now, limit);
  },
};
