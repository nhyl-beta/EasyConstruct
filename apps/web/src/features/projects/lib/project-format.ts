// Seeded projects store `due` as an already-human string ("Jun 30"), while the
// API-backed create flow stores an ISO date ("2027-12-31"). Rendering both raw
// made one column show two formats side by side.
export function formatDue(due: string | null | undefined): string {
  if (!due) return "—";
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(due);
  if (!iso) return due;
  const parsed = new Date(`${iso[0]}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return due;
  const now = new Date();
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(parsed.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function formatContractValue(
  value: number | null | undefined,
  currency: string = "PHP",
): string {
  if (value == null || Number.isNaN(value)) return "—";
  // Was hardcoded to "PHP" regardless of the project's own currency, so a
  // project created in USD/EUR/etc. (apps/web/src/features/projects/types/
  // project.types.ts: PROJECT_CURRENCIES) still displayed its contract value
  // with a ₱ symbol — correct amount, wrong denomination shown.
  // Pinned to en-PH rather than the browser's own locale: with an undefined
  // locale this rendered "PHP 1,234" for anyone whose browser wasn't set to
  // a locale that knows the ₱ symbol; en-PH renders every currency this list
  // offers with its usual symbol.
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}
