import { useMemo } from "react";
import { PurchaseRequestRepository as repo } from "../repositories/purchasing.repository";
import type { CreatePurchaseRequestInput, PurchaseRequest } from "../types/purchasing.types";
import { useRemoteList } from "./use-remote-list";

/** Purchase requests the server lets this role see (Finance: all; PM and staff: their projects). */
export function usePurchaseRequests(enabled = true) {
  const list = useRemoteList<PurchaseRequest>(() => repo.list(), enabled);
  const waitingOnFinance = useMemo(() => list.items.filter((r) => r.status === "pending-finance"), [list.items]);
  const toEndorse = useMemo(() => list.items.filter((r) => r.status === "pending-pm"), [list.items]);

  return {
    ...list,
    requests: list.items,
    waitingOnFinance,
    toEndorse,
    create: (input: CreatePurchaseRequestInput) => list.run(() => repo.create(input)),
    endorse: (id: string) => list.run(() => repo.endorse(id)),
    approve: (id: string, note?: string) => list.run(() => repo.approve(id, note)),
    reject: (id: string, note: string) => list.run(() => repo.reject(id, note)),
    cancel: (id: string) => list.run(() => repo.cancel(id)),
    /** The detail carries the budget impact, which the list does not. */
    detail: (id: string) => repo.get(id),
  };
}
