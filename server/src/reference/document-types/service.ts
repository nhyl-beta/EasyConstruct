// server/src/reference/document-types/service.ts (client demo change #1)
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import type { DocumentType } from "../../db/schema/document-types.js";
import * as repo from "./repository.js";
import {
  assertEditAllowed,
  checkSubmittedType,
  cleanCategory,
  duplicateError,
  findDuplicate,
  prepareTypeName,
} from "./rules.js";

// The active list is read on every document upload, so it is kept briefly in memory. A write on this
// instance clears it at once; another serverless instance sees the change within the TTL, and a type that
// is not in the cached list is looked up again before it is refused, so a NEW type works immediately.
const CACHE_TTL_MS = 15_000;
let cache: { at: number; rows: DocumentType[] } | null = null;

export const invalidateDocumentTypes = () => {
  cache = null;
};

const allTypes = async (fresh = false): Promise<DocumentType[]> => {
  if (!fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await repo.findAll({ includeInactive: true });
  cache = { at: Date.now(), rows };
  return rows;
};

/** Writers see inactive types too (to turn them back on); everyone else sees only the active ones. */
export const list = (includeInactive: boolean) => repo.findAll({ includeInactive });

export const create = async (input: { name: string; category?: string }, actor: { name: string }) => {
  const { name, nameKey } = prepareTypeName(input.name);
  const existing = await repo.findAll({ includeInactive: true });
  if (findDuplicate(nameKey, existing)) throw duplicateError(name);
  const created = await repo.insert({ name, nameKey, category: cleanCategory(input.category), createdBy: actor.name });
  invalidateDocumentTypes();
  if (!created) throw duplicateError(name); // lost a race with the same name
  return created;
};

export const update = async (id: number, input: { name?: string; category?: string; active?: boolean }) => {
  const current = await repo.findById(id);
  if (!current) throw new NotFoundError("Document type", String(id));
  assertEditAllowed(current, { name: input.name, active: input.active });

  const patch: { name?: string; nameKey?: string; category?: string; active?: boolean } = {};
  if (input.name !== undefined) {
    const prepared = prepareTypeName(input.name);
    const existing = await repo.findAll({ includeInactive: true });
    if (findDuplicate(prepared.nameKey, existing, id)) throw duplicateError(prepared.name);
    patch.name = prepared.name;
    patch.nameKey = prepared.nameKey;
  }
  if (input.category !== undefined) patch.category = cleanCategory(input.category);
  if (input.active !== undefined) patch.active = input.active;
  if (Object.keys(patch).length === 0) throw new ValidationError("Nothing to change");

  const updated = await repo.update(id, current.name, patch);
  invalidateDocumentTypes();
  return { before: current, after: updated! };
};

/**
 * The type name to store for a NEW document, or a 400. Existing documents are never re-checked, so a
 * document filed under a type that was later deactivated stays readable.
 */
export const resolveForNewDocument = async (submitted: string): Promise<string> => {
  let check = checkSubmittedType(submitted, await allTypes());
  if (!check.ok && check.reason === "unknown") check = checkSubmittedType(submitted, await allTypes(true));
  if (!check.ok) throw new ValidationError(check.message);
  return check.name;
};
