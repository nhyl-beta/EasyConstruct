import { useMemo } from "react";
import { ProcurementRepository as repo } from "../repositories/purchasing.repository";
import type { CreateOrderInput, PayOrderInput, ProcurementOrder } from "../types/purchasing.types";
import { useRemoteList } from "./use-remote-list";

/** Procurement orders the server lets this role see. */
export function useProcurement(enabled = true) {
  const list = useRemoteList<ProcurementOrder>(() => repo.list(), enabled);
  const inTransit = useMemo(() => list.items.filter((o) => o.status === "ordered" || o.status === "in-transit"), [list.items]);

  return {
    ...list,
    orders: list.items,
    inTransit,
    create: (input: CreateOrderInput) => list.run(() => repo.create(input)),
    ship: (id: string, etaDate?: string) => list.run(() => repo.ship(id, etaDate)),
    deliver: (id: string, input: { note?: string; receiptUrl?: string }) => list.run(() => repo.deliver(id, input)),
    pay: (id: string, input: PayOrderInput) => list.run(() => repo.pay(id, input)),
    cancel: (id: string) => list.run(() => repo.cancel(id)),
  };
}
