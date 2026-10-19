// apps/api/src/project-stakeholders/service.ts (client demo change #4)
import { NotFoundError, ValidationError } from "../core/utils/errors.js";
import { assertProjectWritable } from "../lifecycle/service.js";
import { assertProjectVisible } from "../projects/service.js";
import * as projectsRepo from "../projects/repository.js";
import type { StakeholderInput } from "../validators/stakeholder-validators.js";
import * as repo from "./repository.js";
import { forViewer, normalizeEmail, primaryOwner, projectFieldsFromOwner, type StakeholderRow } from "./rules.js";

export interface Actor {
  id: number;
  name: string;
  role: string;
}

const auth = (a: Actor) => ({ id: a.id, name: a.name, role: a.role });

const clean = (input: Partial<StakeholderInput>) => ({
  ...(input.name !== undefined ? { name: input.name.trim() } : {}),
  ...(input.company !== undefined ? { company: input.company?.trim() || null } : {}),
  ...(input.role !== undefined ? { role: input.role } : {}),
  ...(input.email !== undefined ? { email: input.email?.trim() ? normalizeEmail(input.email) : null } : {}),
  ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
});

const fullRow = (input: StakeholderInput) => clean(input) as { name: string; role: string; company?: string | null; email?: string | null; phone?: string | null };

/** After any change: projects.client / client_email follow the first Owner so older screens keep working. */
const syncProjectClient = async (projectCode: string) => {
  const owner = primaryOwner(await repo.findByProject(projectCode));
  if (owner) await repo.setProjectClient(projectCode, projectFieldsFromOwner(owner));
};

export const list = async (projectCode: string, actor: Actor) => {
  if (!projectCode) throw new ValidationError("projectCode is required");
  await assertProjectVisible(auth(actor), projectCode, "stakeholders");
  return (await repo.findByProject(projectCode)).map((r) => forViewer(r, actor.role));
};

const requireStakeholder = async (id: number) => {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError("Stakeholder", String(id));
  return row;
};

export const create = async (projectCode: string, input: StakeholderInput, actor: Actor) => {
  await assertProjectVisible(auth(actor), projectCode, "stakeholders");
  if (!(await projectsRepo.findByCode(projectCode))) throw new NotFoundError("Project", projectCode);
  await assertProjectWritable(projectCode);
  const created = await repo.insert({ projectCode, ...fullRow(input), createdBy: actor.name });
  await syncProjectClient(projectCode);
  return forViewer(created, actor.role);
};

export const update = async (id: number, input: Partial<StakeholderInput>, actor: Actor) => {
  const row = await requireStakeholder(id);
  await assertProjectVisible(auth(actor), row.projectCode, "stakeholders");
  await assertProjectWritable(row.projectCode);
  const patch = clean(input);
  if (Object.keys(patch).length === 0) throw new ValidationError("Nothing to change");
  const updated = await repo.update(id, patch);
  await syncProjectClient(row.projectCode);
  return { before: row as StakeholderRow, after: forViewer(updated!, actor.role) };
};

export const remove = async (id: number, actor: Actor) => {
  const row = await requireStakeholder(id);
  await assertProjectVisible(auth(actor), row.projectCode, "stakeholders");
  await assertProjectWritable(row.projectCode);
  await repo.remove(id);
  await syncProjectClient(row.projectCode);
  return row as StakeholderRow;
};

/**
 * Stakeholders typed into the New Project wizard, added once the project exists. When none of them is an
 * Owner but the project has a client name or email, one Owner row is made from those (the same rule as the
 * backfill), so every new project has its Owner on the list.
 */
export const createInitial = async (projectCode: string, stakeholders: StakeholderInput[] | undefined, actor: Actor) => {
  const project = await projectsRepo.findByCode(projectCode);
  if (!project) return 0;
  const rows: repo.StakeholderInsert[] = (stakeholders ?? []).map((s) => ({ projectCode, ...fullRow(s), createdBy: actor.name }));
  const client = project.client?.trim() || "";
  const email = project.clientEmail?.trim() || "";
  if (!rows.some((r) => r.role === "Owner") && (client || email)) {
    rows.unshift({ projectCode, name: client || email, company: client || null, role: "Owner", email: email ? normalizeEmail(email) : null, phone: null, createdBy: actor.name });
  }
  const n = await repo.insertMany(rows);
  if (n > 0) await syncProjectClient(projectCode);
  return n;
};

/** The project's client name / email was edited on the project itself: carry it onto the first Owner row. */
export const syncFromProject = async (project: { code: string; client: string | null; clientEmail: string | null }, actor: Actor) => {
  const client = project.client?.trim() || "";
  const email = project.clientEmail?.trim() || "";
  if (!client && !email) return;
  const owner = primaryOwner(await repo.findByProject(project.code));
  if (!owner) {
    await repo.insert({ projectCode: project.code, name: client || email, company: client || null, role: "Owner", email: email ? normalizeEmail(email) : null, createdBy: actor.name });
    return;
  }
  await repo.update(owner.id, { company: client || owner.company, email: email ? normalizeEmail(email) : null });
};
