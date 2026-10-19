// service.ts
import * as repo from "./repository.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { assertProjectWritable, refreshProjectProgress } from "../lifecycle/service.js";
import * as notificationsService from "../notifications/service.js";
import type {
  CreateBlueprintInput,
  UpdateBlueprintInput,
  BlueprintFilters,
  DecideBlueprintInput,
} from "./types.js";

export const getAll = async (filters: BlueprintFilters) => repo.findAll(filters);
export const getById = async (id: number) => {
  const bp = await repo.findById(id);
  if (!bp) throw new NotFoundError('Blueprint', String(id));
  return bp;
};
export const create = async (input: CreateBlueprintInput) => {
  if (input.projectCode) await assertProjectWritable(input.projectCode);
  const created = await repo.create(input);
  // projectCode is nullable until E3 wires a project onto every blueprint —
  // gate D3 (approved+current blueprint) can't read one that isn't there yet.
  if (created?.projectCode) await refreshProjectProgress(created.projectCode);
  return created;
};
export const update = async (id: number, input: UpdateBlueprintInput) => {
  const existing = await getById(id);
  if (existing.projectCode) await assertProjectWritable(existing.projectCode);
  const updated = await repo.update(id, input);
  if (!updated) throw new NotFoundError('Blueprint', String(id));
  if (updated.projectCode) await refreshProjectProgress(updated.projectCode);
  return updated;
};
const DECIDABLE_APPROVALS = ["Approved", "Rejected", "Revision Required"] as const;

// Part B item 8: gate D3 reads blueprints.approval="Approved" +
// status="Current", but until this, the only write path that could ever
// set `approval` was the generic PATCH the architect's own
// architect-blueprints.tsx calls — the wrong actor deciding their own
// submission. This is a role-gated decision action (route: consultant/
// project-manager/admin, see blueprints/routes.ts), separate from the
// generic update so the drawing's own author can still edit metadata
// (title, folder, revision, ...) without also being able to self-approve.
export const decide = async (input: DecideBlueprintInput) => {
  if (!DECIDABLE_APPROVALS.includes(input.approval)) {
    throw new ValidationError(`approval must be one of: ${DECIDABLE_APPROVALS.join(", ")}`);
  }
  const existing = await getById(input.id);
  if (existing.projectCode) await assertProjectWritable(existing.projectCode);
  const updated = await repo.update(input.id, {
    approval: input.approval,
    // Approving a blueprint also marks it the Current one for its
    // drawing/design — the same "Current" gate D3 checks alongside
    // approval — an approval left Superseded/Draft would never satisfy it.
    ...(input.approval === "Approved" ? { status: "Current" } : {}),
  });
  if (!updated) throw new NotFoundError("Blueprint", String(input.id));

  await notificationsService.create({
    recipientRole: "architect",
    title: `Blueprint ${input.approval.toLowerCase()}`,
    body: `"${updated.title}" (${updated.drawingNumber}) was ${input.approval.toLowerCase()}.`,
    link: "/blueprints",
    projectCode: updated.projectCode ?? undefined,
  });

  if (updated.projectCode) await refreshProjectProgress(updated.projectCode);
  return updated;
};

export const remove = async (id: number) => {
  const existing = await getById(id);
  const deleted = await repo.remove(id);
  if (!deleted) throw new NotFoundError('Blueprint', String(id));
  if (existing.projectCode) await refreshProjectProgress(existing.projectCode);
  return deleted;
};