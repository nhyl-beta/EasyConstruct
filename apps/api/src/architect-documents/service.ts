// service.ts
import { NotFoundError } from "../utils/errors.js";
import * as repo from "./repository.js";
import type {
  ArchitectDocumentFilters,
  CreateArchitectDocumentInput,
  UpdateArchitectDocumentInput,
} from "./types.js";

export const getAll = async (filters: ArchitectDocumentFilters) =>
  repo.findAll(filters);
export const getById = async (id: number) => {
  const doc = await repo.findById(id);
  if (!doc) throw new NotFoundError("Document", String(id));
  return doc;
};
export const create = async (input: CreateArchitectDocumentInput) =>
  repo.create(input);
export const update = async (
  id: number,
  input: UpdateArchitectDocumentInput,
) => {
  await getById(id);
  const updated = await repo.update(id, input);
  if (!updated) throw new NotFoundError("Document", String(id));
  return updated;
};
export const remove = async (id: number) => {
  await getById(id);
  const deleted = await repo.remove(id);
  if (!deleted) throw new NotFoundError("Document", String(id));
  return deleted;
};
