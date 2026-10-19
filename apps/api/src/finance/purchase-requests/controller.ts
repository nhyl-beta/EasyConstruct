import { handle, idParam } from "../purchasing/http.js";
import { purchaseRequestsService as service } from "./service.js";

export const purchaseRequestsController = {
  list: handle(async (actor, req) => ({
    data: await service.list(actor, typeof req.query.status === "string" ? req.query.status : undefined),
    message: "Purchase requests retrieved",
  })),
  get: handle(async (actor, req) => ({ data: await service.detail(actor, idParam(req)) })),
  create: handle(async (actor, req) => ({
    data: await service.create(actor, req.body),
    status: 201,
    message: "Purchase request raised",
  })),
  update: handle(async (actor, req) => ({ data: await service.update(actor, idParam(req), req.body) })),
  endorse: handle(async (actor, req) => ({ data: await service.endorse(actor, idParam(req)), message: "Purchase request endorsed" })),
  approve: handle(async (actor, req) => {
    const data = await service.approve(actor, idParam(req), req.body?.note);
    return { data, message: data.warning ?? "Purchase request approved" };
  }),
  reject: handle(async (actor, req) => ({ data: await service.reject(actor, idParam(req), req.body?.note), message: "Purchase request rejected" })),
  cancel: handle(async (actor, req) => ({ data: await service.cancel(actor, idParam(req)), message: "Purchase request cancelled" })),
};
