import type { ExpenseCategory } from "../types/categories.types";

/** Compare names the way the server does: case-insensitive, spaces collapsed. */
export const categoryKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Inline check for a category name; returns a message, or null when it is fine. */
export function nameProblem(raw: string, all: readonly ExpenseCategory[], exceptId?: number): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return "Enter a name.";
  if (name.length < 2) return "Use at least 2 characters.";
  if (name.length > 64) return "Use at most 64 characters.";
  const clash = all.find((c) => c.id !== exceptId && categoryKey(c.name) === categoryKey(name));
  if (clash) return `"${clash.name}" already exists${clash.isActive ? "" : " (retired - restore it instead)"}.`;
  return null;
}
