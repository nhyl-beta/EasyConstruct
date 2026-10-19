// apps/api/src/reference/service.ts (objectives fix 1.2)
import { AppError, ValidationError } from "../../../core/utils/errors.js";
import * as repo from "./repository.js";
import { findNameMatches, normalizeName, type NameMatch } from "./names.js";

export type { ReferenceKind } from "./repository.js";

const LABEL: Record<repo.ReferenceKind, string> = { clients: "client", vendors: "vendor" };

export const list = (kind: repo.ReferenceKind, search?: string) => repo.findAll(kind, search);

/**
 * Adds a client or vendor.
 *  - The same normalized name already exists: refused with the existing record
 *    (409 DUPLICATE_NAME), so the caller uses it instead of adding another.
 *  - A similar name exists: refused with the matches (409 SIMILAR_NAME) unless
 *    `confirmSimilar` is true. Similarity is advice; a person can say it is new.
 */
export const create = async (
  kind: repo.ReferenceKind,
  input: { name: string; confirmSimilar?: boolean },
  actor: { name: string },
) => {
  const name = input.name.trim().replace(/\s+/g, " ");
  const nameKey = normalizeName(name);
  if (!nameKey) throw new ValidationError(`Enter a ${LABEL[kind]} name`);

  const matches = findNameMatches(name, await repo.findNames(kind));
  const exact = matches.find((m) => m.exact);
  if (exact) {
    throw new AppError(409, "DUPLICATE_NAME", `"${exact.name}" is already a ${LABEL[kind]}. Use it instead of adding it again.`, {
      matches,
      existing: await repo.findById(kind, exact.id),
    });
  }
  if (matches.length > 0 && !input.confirmSimilar) {
    throw new AppError(
      409,
      "SIMILAR_NAME",
      `Similar ${LABEL[kind]}${matches.length === 1 ? "" : "s"} already exist${matches.length === 1 ? "s" : ""}: ${matches.map((m) => m.name).join(", ")}. Use one of them, or confirm this is a different ${LABEL[kind]}.`,
      { matches },
    );
  }

  const created = await repo.insert(kind, { name, nameKey, createdBy: actor.name });
  if (!created) {
    // Lost a race to someone adding the same name at the same moment.
    const existing = await repo.findByKey(kind, nameKey);
    throw new AppError(409, "DUPLICATE_NAME", `"${name}" was just added as a ${LABEL[kind]}. Use it instead.`, { matches: [], existing });
  }
  return created;
};

/** Other names that look like `candidate`, for create forms that only warn (employees, projects). */
export const matchesIn = (candidate: string, existing: { id: number; name: string }[]): NameMatch[] =>
  findNameMatches(candidate, existing);
