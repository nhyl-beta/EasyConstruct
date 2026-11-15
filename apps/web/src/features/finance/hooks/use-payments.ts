import { ClientPaymentRepository as repo } from "../repositories/payments.repository";
import type { CreateClientPaymentInput } from "../types/payments.types";
import { useRemoteList } from "./use-remote-list";

/** Client payments the server lets this role see (Finance: all; PM: their projects). */
export function usePayments(enabled = true) {
  const list = useRemoteList(() => repo.list(), enabled);
  return {
    ...list,
    payments: list.items,
    create: (input: CreateClientPaymentInput) => list.run(() => repo.create(input)),
  };
}
