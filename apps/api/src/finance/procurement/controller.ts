import { handle, idParam } from "../purchasing/http.js";
import { procurementService as service } from "./service.js";

export const procurementController = {
  list: handle(async (actor, req) => ({
    data: await service.list(actor, typeof req.query.status === "string" ? req.query.status : undefined),
    message: "Procurement orders retrieved",
  })),
  get: handle(async (actor, req) => ({ data: await service.detail(actor, idParam(req)) })),
  create: handle(async (actor, req) => ({ data: await service.create(actor, req.body), status: 201, message: "Order created" })),
  ship: handle(async (actor, req) => ({ data: await service.ship(actor, idParam(req), req.body?.etaDate), message: "Order marked in transit" })),
  deliver: handle(async (actor, req) => ({ data: await service.deliver(actor, idParam(req), req.body ?? {}), message: "Delivery confirmed" })),
  pay: handle(async (actor, req) => ({ data: await service.pay(actor, idParam(req), req.body), message: "Payment recorded" })),
  cancel: handle(async (actor, req) => ({ data: await service.cancel(actor, idParam(req)), message: "Order cancelled" })),
};
