import { NotFoundError, ValidationError } from "../utils/errors.js";
import { assertProjectWritable, refreshProjectProgress } from "../lifecycle/service.js";
import * as projectMemberRepo from "../project-members/repository.js";
import * as repo from "./repository.js";
import { designs as designsTable } from "../db/schema/designs.js";
import { orderByFor, paginate, type PageRequest } from "../utils/pagination.js";
import type {
  AssignedEngineer,
  CreateDesignInput,
  DesignFilters,
  UpdateDesignInput,
} from "./types.js";

// E4: an assigned engineer who isn't actually staffed on the project can't
// be who gate D1 means by "a staffed engineer" — enforced here so a design
// can never carry one gate D1 will silently never count.
const assertEngineersStaffed = async (
  projectCode: string,
  engineers: AssignedEngineer[] | undefined,
) => {
  if (!engineers?.length) return;
  const staffed = await projectMemberRepo.findAll({ projectCode, role: "engineer" });
  const staffedIds = new Set(staffed.map((m) => m.userId));
  const unstaffed = engineers.filter((e) => !staffedIds.has(e.userId));
  if (unstaffed.length > 0) {
    throw new ValidationError(
      `${unstaffed.map((e) => e.userName).join(", ")} ${unstaffed.length === 1 ? "is" : "are"} not staffed on ${projectCode} as an engineer`,
    );
  }
};

/**
 * `designs.assignedEngineerId/_name` predate multi-engineer support. They're
 * kept in sync with the first entry of the engineer set so anything still
 * reading the flat columns (older screens, the designs list filter) stays
 * correct, while design_engineers remains the source of truth.
 */
function denormalizeFirstEngineer(engineers: AssignedEngineer[] | undefined) {
  if (engineers === undefined) return {};
  const first = engineers[0];
  return {
    assignedEngineerId: first?.userId ?? null,
    assignedEngineerName: first?.userName ?? null,
  };
}

const attachEngineers = <T extends { id: number }>(
  rows: T[],
  memberships: Array<{ designId: number; userId: number; userName: string }>,
) => {
  const byDesign = new Map<number, AssignedEngineer[]>();
  for (const m of memberships) {
    const list = byDesign.get(m.designId) ?? [];
    list.push({ userId: m.userId, userName: m.userName });
    byDesign.set(m.designId, list);
  }
  return rows.map((row) => ({
    ...row,
    assignedEngineers: byDesign.get(row.id) ?? [],
  }));
};

export const getAll = async (filters: DesignFilters) => {
  const rows = await repo.findAll(filters);
  const memberships = await repo.findEngineersForDesigns(rows.map((r) => r.id));
  return attachEngineers(rows, memberships);
};

export const statusCounts = (filters: DesignFilters) => repo.statusCounts(filters);

export const getPage = async (filters: DesignFilters, request: PageRequest) => {
  const { items: rows, meta } = await paginate(
    request,
    () => repo.countFiltered(filters),
    (window) => repo.findPage(filters, window, orderByFor(request, repo.DESIGN_SORT_COLUMNS, repo.defaultDesignOrder, designsTable.id)),
  );
  const memberships = await repo.findEngineersForDesigns(rows.map((r) => r.id));
  return { items: attachEngineers(rows, memberships), meta };
};

export const getById = async (id: number) => {
  const design = await repo.findById(id);
  if (!design) throw new NotFoundError("Design", String(id));
  const engineers = await repo.findEngineers(id);
  return {
    ...design,
    assignedEngineers: engineers.map((e) => ({
      userId: e.userId,
      userName: e.userName,
    })),
  };
};

export const create = async (input: CreateDesignInput) => {
  const { assignedEngineers, ...designInput } = input;
  await assertProjectWritable(designInput.projectCode);
  await assertEngineersStaffed(designInput.projectCode, assignedEngineers);

  const created = await repo.create({
    ...designInput,
    ...denormalizeFirstEngineer(assignedEngineers),
  });
  if (!created) throw new Error("Failed to create design");

  if (assignedEngineers?.length) {
    await repo.replaceEngineers(created.id, assignedEngineers);
  }

  await refreshProjectProgress(created.projectCode);
  return getById(created.id);
};

export const update = async (id: number, input: UpdateDesignInput) => {
  const existing = await getById(id);
  await assertProjectWritable(existing.projectCode);
  const { assignedEngineers, ...designInput } = input;
  await assertEngineersStaffed(existing.projectCode, assignedEngineers);

  const updated = await repo.update(id, {
    ...designInput,
    ...denormalizeFirstEngineer(assignedEngineers),
  });
  if (!updated) throw new NotFoundError("Design", String(id));

  // Only touched when the caller actually sent a list — a PATCH of, say,
  // status alone must not silently unassign everyone.
  if (assignedEngineers !== undefined) {
    await repo.replaceEngineers(id, assignedEngineers);
  }

  await refreshProjectProgress(updated.projectCode);
  return getById(id);
};

export const remove = async (id: number) => {
  const existing = await getById(id);
  // design_engineers rows go with it via ON DELETE CASCADE.
  const deleted = await repo.remove(id);
  if (!deleted) throw new NotFoundError("Design", String(id));
  await refreshProjectProgress(existing.projectCode);
  return deleted;
};
