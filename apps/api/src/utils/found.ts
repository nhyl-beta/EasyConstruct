import { NotFoundError } from "./errors.js";

/**
 * The row an UPDATE or DELETE ... RETURNING produced, or a 404 when nothing matched. Returning
 * null here made PATCH and DELETE on a missing id answer 200 "deleted".
 */
export function orNotFound<T>(row: T | null | undefined, resource: string, id: number | string): T {
  if (row === null || row === undefined) throw new NotFoundError(resource, String(id));
  return row;
}
