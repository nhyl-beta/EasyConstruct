import { ValidationError } from "./errors.js";

/**
 * A positive integer id from a URL parameter. A non-numeric value ("abc", "1.5", "", "-3")
 * is a 400 here instead of Number() -> NaN reaching Postgres and coming back as a 500.
 */
export function parseIdParam(value: unknown, label = "id"): number {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(text)) throw new ValidationError(`${label} must be a whole number`);
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < 1) throw new ValidationError(`${label} must be a positive whole number`);
  return n;
}
