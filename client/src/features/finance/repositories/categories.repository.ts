import { apiClient } from "@/services/api.client";
import type { CategoryResult, CategoryUsage, ExpenseCategory } from "../types/categories.types";

type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const usage = (v: unknown): CategoryUsage | undefined => {
  if (!v || typeof v !== "object") return undefined;
  const o = obj(v);
  return {
    budgets: num(o.budgets),
    expenses: num(o.expenses),
    purchaseRequests: num(o.purchaseRequests),
    reimbursements: num(o.reimbursements),
    procurementOrders: num(o.procurementOrders),
    budgetAllocations: num(o.budgetAllocations),
  };
};

const normalize = (v: unknown): ExpenseCategory => {
  const o = obj(v);
  return {
    id: num(o.id),
    name: typeof o.name === "string" ? o.name : "",
    isActive: o.isActive !== false,
    isSystem: o.isSystem === true,
    sortOrder: num(o.sortOrder),
    usage: usage(o.usage),
  };
};

/** Runs a mutation and turns a thrown error (the server's own message, e.g. a 409) into a result. */
async function act(call: () => Promise<unknown>): Promise<CategoryResult> {
  try {
    await call();
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

const BASE = "/finance/categories";

export const CategoryRepository = {
  /** Every category, active and retired, ordered as the server orders them. */
  async list(withUsage = false): Promise<ExpenseCategory[]> {
    const json = obj(await apiClient.get(withUsage ? `${BASE}?withUsage=true` : BASE));
    return (Array.isArray(json.data) ? json.data : []).map(normalize);
  },
  create: (name: string) => act(() => apiClient.post(BASE, { name })),
  rename: (id: number, name: string) => act(() => apiClient.patch(`${BASE}/${id}`, { name })),
  reorder: (id: number, sortOrder: number) => act(() => apiClient.patch(`${BASE}/${id}`, { sortOrder })),
  retire: (id: number) => act(() => apiClient.post(`${BASE}/${id}/retire`, {})),
  restore: (id: number) => act(() => apiClient.post(`${BASE}/${id}/restore`, {})),
};
