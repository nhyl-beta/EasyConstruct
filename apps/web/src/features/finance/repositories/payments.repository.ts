import { apiClient } from "@/services/api.client";
import type { ClientPayment, CreateClientPaymentInput } from "../types/payments.types";
import type { ActionResult } from "../types/purchasing.types";

type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

const normalize = (v: unknown): ClientPayment => {
  const o = obj(v);
  return {
    id: str(o.id),
    project: str(o.project),
    amount: num(o.amount),
    receivedAt: str(o.receivedAt),
    note: strOrNull(o.note),
    createdBy: strOrNull(o.createdBy),
  };
};

/** `{ success, message, data }` -> data */
const data = (json: unknown): unknown => obj(json).data;

/** Runs a mutation and turns a thrown error into a result, like the purchasing repository. */
async function act<T>(call: () => Promise<unknown>, map: (d: unknown) => T): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: map(data(await call())), warning: null, error: null };
  } catch (err) {
    return { ok: false, data: null, warning: null, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export const ClientPaymentRepository = {
  async list(): Promise<ClientPayment[]> {
    return arr(data(await apiClient.get("/finance/payments"))).map(normalize);
  },
  create: (input: CreateClientPaymentInput) => act(() => apiClient.post("/finance/payments", input), normalize),
};
