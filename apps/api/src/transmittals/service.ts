// apps/api/src/transmittals/service.ts — the transmittal cover sheet for sending request documents out.
import { assertProjectWritable } from "../lifecycle/service.js";
import * as repo from "../design-requests/repository.js";
import { assertProjectVisible, scopeRowsToVisible } from "../projects/service.js";
import { logAudit } from "../utils/audit.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/errors.js";
import type { CreateTransmittalInput } from "../validators/design-request-validators.js";

export interface Actor {
  id: number;
  name: string;
  role: string;
}
const vis = (a: Actor) => ({ id: a.id, role: a.role, name: a.name });
const WRITERS = ["project-manager", "engineer", "architect", "admin"];
const assertWriter = (a: Actor) => {
  if (!WRITERS.includes(a.role)) throw new ForbiddenError("Only the PM, Engineer or Architect can prepare a transmittal");
};
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const require = async (id: number) => {
  const row = await repo.findTransmittalById(id);
  if (!row) throw new NotFoundError("Transmittal", String(id));
  return row;
};

/** Every item that points at a request must point at one on the same project. */
const checkItems = async (projectCode: string, items: CreateTransmittalInput["items"]) => {
  const requests = await repo.findByIds(items.flatMap((it) => (it.requestId ? [it.requestId] : [])));
  for (const it of items) {
    if (!it.requestId) continue;
    const req = requests.get(it.requestId);
    if (!req || req.projectCode !== projectCode) throw new ValidationError(`Request ${it.requestId} is not on project ${projectCode}`);
  }
};

export const list = async (projectCode: string | undefined, actor: Actor) =>
  scopeRowsToVisible(vis(actor), await repo.findTransmittals(projectCode), (t) => t.projectCode);

export const getById = async (id: number, actor: Actor) => {
  const row = await require(id);
  await assertProjectVisible(vis(actor), row.projectCode, "transmittals");
  return row;
};

export const create = async (input: CreateTransmittalInput, actor: Actor) => {
  assertWriter(actor);
  await assertProjectVisible(vis(actor), input.projectCode, "transmittals");
  await assertProjectWritable(input.projectCode);
  await checkItems(input.projectCode, input.items);
  const now = new Date();
  const created = await repo.insertTransmittal(
    { projectCode: input.projectCode, now },
    {
      dateIssued: input.dateIssued ?? today(),
      location: input.location,
      toName: input.toName,
      thruName: input.thruName,
      type: input.type,
      subject: input.subject,
      purposes: input.purposes,
      purposeOther: input.purposeOther,
      transmittedByUserId: actor.id,
      transmittedByName: actor.name,
      receivedByName: input.receivedByName,
      status: "draft",
    },
    input.items,
  );
  await logAudit({ entityType: "transmittal", entityId: String(created.id), action: "created", actor: actor.name, summary: `Transmittal ${created.controlNo} to ${created.toName}`, projectCode: created.projectCode });
  return getById(created.id, actor);
};

export const update = async (id: number, input: Partial<Omit<CreateTransmittalInput, "projectCode">>, actor: Actor) => {
  assertWriter(actor);
  const row = await require(id);
  await assertProjectVisible(vis(actor), row.projectCode, "transmittals");
  if (row.status !== "draft") throw new ConflictError("Only a draft transmittal can be edited");
  if (input.items) await checkItems(row.projectCode, input.items);
  const { items, ...fields } = input;
  await repo.updateTransmittal(id, fields, items);
  return getById(id, actor);
};

export const issue = async (id: number, actor: Actor) => {
  assertWriter(actor);
  const row = await require(id);
  await assertProjectVisible(vis(actor), row.projectCode, "transmittals");
  if (row.status !== "draft") throw new ConflictError(`Transmittal is ${row.status}`);
  await repo.updateTransmittal(id, { status: "issued" });
  await logAudit({ entityType: "transmittal", entityId: String(id), action: "issued", actor: actor.name, summary: `Transmittal ${row.controlNo} issued to ${row.toName}`, projectCode: row.projectCode });
  return getById(id, actor);
};

export const acknowledge = async (id: number, ack: { name: string; signature?: string; office?: string }, actor: Actor) => {
  assertWriter(actor);
  const row = await require(id);
  await assertProjectVisible(vis(actor), row.projectCode, "transmittals");
  if (row.status === "draft") throw new ConflictError("Issue the transmittal before logging a receipt");
  await repo.addAcknowledgement(id, ack);
  if (row.status === "issued") await repo.updateTransmittal(id, { status: "acknowledged" });
  await logAudit({ entityType: "transmittal", entityId: String(id), action: "acknowledged", actor: actor.name, summary: `${row.controlNo} received by ${ack.name}`, projectCode: row.projectCode });
  return getById(id, actor);
};
