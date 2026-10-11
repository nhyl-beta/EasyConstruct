// The list of expense categories is maintained by Finance (Manage categories) and
// served by /api/finance/categories; nothing here hard-codes it. This file only
// holds the keyword hint used to pre-select a category for a requirement.

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * A requirement's own category mapped to the nearest expense category, checked
 * against the live list (`available`, the active category names). Returns "" when
 * nothing maps, or when the mapped name is not in the list.
 */
export function expenseCategoryForRequirement(requirementCategory: string, available: readonly string[]): string {
  const find = (name: string) => available.find((a) => norm(a) === norm(name)) ?? "";
  const direct = find(requirementCategory);
  if (direct) return direct;
  const c = requirementCategory.toLowerCase();
  if (/material|supply|supplies/.test(c)) return find("Materials");
  if (/equipment|machine|tool/.test(c)) return find("Equipment");
  if (/safety|ppe/.test(c)) return find("PPE");
  if (/transport|haul|delivery/.test(c)) return find("Transport");
  if (/service|labor|labour|subcontract/.test(c)) return find("Services");
  return "";
}
