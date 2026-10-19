// apps/api/src/documents/advisory.ts
//
// Pure rules for Consultant advisory documents: a file is always required, and
// an optional "related to" proposal/design must exist on the SAME project.
// The lookup is injected so the rules are testable without a database.
import { ValidationError } from "../core/utils/errors.js";

export const RELATED_TYPES = ["proposal", "design"] as const;
export type RelatedType = (typeof RELATED_TYPES)[number];

export interface RelatedInput {
  relatedType?: string | null;
  relatedId?: number | string | null;
}

export type RelatedLookup = (type: RelatedType, id: number) => Promise<{ projectCode: string } | null>;

export const assertAdvisoryHasFile = (role: string | undefined, hasFile: boolean): void => {
  if (role === "consultant" && !hasFile) {
    throw new ValidationError("Attach a file: advisory documents cannot be saved without one");
  }
};

/**
 * Returns the validated relation to store ({} when none was given). Both
 * fields must be given together; the item must exist and belong to `project`.
 */
export const resolveRelatedItem = async (
  project: string,
  input: RelatedInput,
  lookup: RelatedLookup,
): Promise<{ relatedType?: RelatedType; relatedId?: number }> => {
  const type = input.relatedType ? String(input.relatedType) : "";
  const rawId = input.relatedId === null || input.relatedId === undefined ? "" : String(input.relatedId);
  if (!type && !rawId) return {};
  if (!type || !rawId) {
    throw new ValidationError("A related item needs both a type and an id");
  }
  if (!(RELATED_TYPES as readonly string[]).includes(type)) {
    throw new ValidationError(`Related type must be one of: ${RELATED_TYPES.join(", ")}`);
  }
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("Related item id is invalid");
  }
  const item = await lookup(type as RelatedType, id);
  if (!item) throw new ValidationError(`The related ${type} was not found`);
  if (item.projectCode !== project) {
    throw new ValidationError(`The related ${type} belongs to a different project`);
  }
  return { relatedType: type as RelatedType, relatedId: id };
};
