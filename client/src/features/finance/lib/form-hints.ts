// What is still missing before a finance dialog can be submitted (pure). The dialogs keep their
// submit button disabled until this is empty, and say why instead of leaving it silently grey.

export function missingForExpense(f: { vendor: string; project: string; category: string; amount: string }): string[] {
  const out: string[] = [];
  if (!f.vendor.trim()) out.push("a vendor");
  if (!f.project) out.push("a project");
  if (!f.category) out.push("a category");
  if (!(Number(f.amount) > 0)) out.push("an amount greater than 0");
  return out;
}

export function missingForBudget(f: { project: string; category: string; owner: string; planned: string; fiscalYear: string }): string[] {
  const out: string[] = [];
  if (!f.project) out.push("a project");
  if (!f.category) out.push("a category");
  if (!f.owner.trim()) out.push("an owner");
  if (f.planned.trim() === "" || !(Number(f.planned) >= 0)) out.push("a planned amount (0 or more)");
  if (!/^\d{4}$/.test(f.fiscalYear)) out.push("a four-digit fiscal year");
  return out;
}

/** "Add a vendor, a project and an amount greater than 0 to continue." */
export function missingSentence(missing: string[]): string | null {
  if (missing.length === 0) return null;
  const list = missing.length === 1 ? missing[0]! : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `Add ${list} to continue.`;
}
