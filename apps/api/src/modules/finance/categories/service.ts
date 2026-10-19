import { logAudit } from "../../../core/audit/audit.js";
import { ConflictError, NotFoundError } from "../../../core/utils/errors.js";
import { categoriesRepository as repo, type CategoryRow } from "./repository.js";
import {
  assertNameFree,
  categoryForUpdate,
  assertRenamable,
  assertRetirable,
  emptyUsage,
  nameKey,
  normalizeName,
  requireActive,
  type CategoryUsage,
} from "./rules.js";

const ENTITY = "expense-category";

export interface CategoryDto extends CategoryRow {
  usage?: CategoryUsage;
}

async function mustFind(id: number): Promise<CategoryRow> {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError("Expense category", String(id));
  return row;
}

/**
 * The canonical stored name of the active category matching `input`
 * (case-insensitive), for the other modules to call before they write a
 * category. Unknown or retired -> ValidationError (400).
 */
export async function resolveActiveCategory(input: string): Promise<string> {
  return requireActive(await repo.findAll({ activeOnly: true }), input);
}

/**
 * For an update: the canonical name to store when `next` differs from the
 * record's `current` category, or null to leave it untouched (an unchanged
 * category is always allowed, even when it has since been retired).
 */
export async function resolveCategoryChange(current: string | null, next: string): Promise<string | null> {
  if (next === current) return null;
  return categoryForUpdate(await repo.findAll({ activeOnly: true }), current, next);
}

export const categoriesService = {
  async list(opts: { activeOnly?: boolean; withUsage?: boolean }): Promise<CategoryDto[]> {
    const rows = await repo.findAll({ activeOnly: opts.activeOnly });
    if (!opts.withUsage) return rows;
    const usage = await repo.usageByCategory();
    return rows.map((r) => ({ ...r, usage: usage.get(nameKey(r.name)) ?? emptyUsage() }));
  },

  async create(actor: { name: string }, input: { name: string; sortOrder?: number }) {
    const name = normalizeName(input.name);
    assertNameFree(await repo.findAll(), name);
    const row = await repo.insert({
      name,
      sortOrder: input.sortOrder ?? (await repo.nextSortOrder()),
      createdBy: actor.name,
    });
    // The unique index decided a race the check above could not see.
    if (!row) throw new ConflictError(`A category named "${name}" already exists`);
    await logAudit({ entityType: ENTITY, entityId: String(row.id), action: "created", actor: actor.name, summary: name });
    return row;
  },

  /** Rename (only when unused and not a system category) and/or reorder. */
  async update(actor: { name: string }, id: number, patch: { name?: string; sortOrder?: number }) {
    const row = await mustFind(id);
    const values: { name?: string; sortOrder?: number } = {};

    if (patch.name !== undefined) {
      const name = normalizeName(patch.name);
      if (name !== row.name) {
        assertNameFree(await repo.findAll(), name, row.id);
        assertRenamable(row, (await repo.usageByCategory()).get(nameKey(row.name)) ?? emptyUsage());
        values.name = name;
      }
    }
    if (patch.sortOrder !== undefined && patch.sortOrder !== row.sortOrder) values.sortOrder = patch.sortOrder;
    if (Object.keys(values).length === 0) return row;

    // Conditional on the name we checked: a concurrent rename makes this a 409.
    const updated = await repo.updateIf(id, { name: row.name }, values);
    if (!updated) throw new ConflictError(`"${row.name}" was changed by someone else; reload and try again`);
    const parts = [
      values.name !== undefined ? `renamed ${row.name} to ${values.name}` : null,
      values.sortOrder !== undefined ? `order ${row.sortOrder} to ${values.sortOrder}` : null,
    ].filter(Boolean);
    await logAudit({ entityType: ENTITY, entityId: String(id), action: "updated", actor: actor.name, summary: parts.join("; ") });
    return updated;
  },

  async retire(actor: { name: string }, id: number) {
    const row = await mustFind(id);
    assertRetirable(row);
    const updated = await repo.updateIf(id, { isActive: true }, { isActive: false });
    if (!updated) throw new ConflictError(`"${row.name}" is already retired`);
    await logAudit({ entityType: ENTITY, entityId: String(id), action: "retired", actor: actor.name, summary: row.name });
    return updated;
  },

  async restore(actor: { name: string }, id: number) {
    const row = await mustFind(id);
    const updated = await repo.updateIf(id, { isActive: false }, { isActive: true });
    if (!updated) throw new ConflictError(`"${row.name}" is already active`);
    await logAudit({ entityType: ENTITY, entityId: String(id), action: "restored", actor: actor.name, summary: row.name });
    return updated;
  },
};
