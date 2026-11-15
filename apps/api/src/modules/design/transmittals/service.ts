// apps/api/src/transmittals/service.ts — the transmittal cover sheet for sending request documents out.
import { assertProjectWritable } from "../../projects/index.js";
import * as repo from "../design-requests/repository.js";
import { assertProjectVisible, scopeRowsToVisible } from "../../projects/index.js";
import { logAudit } from "../../../core/audit/audit.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../../core/utils/errors.js";
import type { CreateTransmittalInput } from "../design-requests/validators.js";
import { sendMail } from "../../../core/mail/mailer.js";
import { usersRepo } from "../../iam/index.js";
import type { Transmittal, TransmittalItem } from "../../../core/db/schema/design-requests.js";

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

// `toName` is a free-text recipient (an office or a person's name, per the
// paper cover-sheet convention) — but it's common for people to put an
// actual address in it expecting the transmittal to be emailed there, and
// until now issuing one never sent anything anywhere. Only attempt a send
// when it's actually email-shaped, so a plain office name is left alone.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const buildTransmittalEmail = (row: Transmittal & { items: TransmittalItem[] }) => {
  const purpose = [...row.purposes, ...(row.purposeOther ? [row.purposeOther] : [])].join(", ") || "—";
  const particulars = row.items.map((it, i) => `${i + 1}. ${it.particulars}${it.remarks ? ` — ${it.remarks}` : ""}`);
  const lines = [
    `Transmittal ${row.controlNo}`,
    `Project: ${row.projectCode}`,
    `Subject: ${row.subject}`,
    `Purpose: ${purpose}`,
    row.thruName ? `Thru: ${row.thruName}` : null,
    "",
    "Particulars:",
    ...particulars,
    "",
    `Transmitted by ${row.transmittedByName} on ${row.dateIssued}.`,
  ].filter((l): l is string => l !== null);
  return { subject: `Transmittal ${row.controlNo}: ${row.subject}`, text: lines.join("\n") };
};

/** Never throws — a failed or skipped send still leaves the transmittal issued. */
const attemptEmail = async (row: Transmittal & { items: TransmittalItem[] }, actor: Actor): Promise<{ emailStatus?: "sent" | "failed" }> => {
  if (!EMAIL_RE.test(row.toName.trim())) return {};
  try {
    const sender = await usersRepo.findById(actor.id);
    const { subject, text } = buildTransmittalEmail(row);
    await sendMail({ to: row.toName.trim(), subject, text, ...(sender?.email ? { cc: sender.email, replyTo: sender.email } : {}) });
    return { emailStatus: "sent" };
  } catch (err) {
    console.warn(`[transmittals] email for ${row.controlNo} to ${row.toName} failed:`, err instanceof Error ? err.message : err);
    return { emailStatus: "failed" };
  }
};

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
  const emailFields = await attemptEmail(row, actor);
  await repo.updateTransmittal(id, { status: "issued", ...emailFields });
  await logAudit({
    entityType: "transmittal",
    entityId: String(id),
    action: "issued",
    actor: actor.name,
    summary: `Transmittal ${row.controlNo} issued to ${row.toName}${emailFields.emailStatus ? ` (email ${emailFields.emailStatus})` : ""}`,
    projectCode: row.projectCode,
  });
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
