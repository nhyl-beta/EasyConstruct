// Seed defaults for the managed expense-category list (table `expense_categories`).
// Used by the migration's seed, the demo schema top-up and the demo scripts ONLY.
// Nothing validates against this at runtime: the live list is the table, which
// Finance maintains (see finance/categories). Order matches the seed.
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Materials",
  "Labor",
  "Equipment",
  "Subcontractors",
  "Permits",
  "PPE",
  "Transport",
  "Services",
  "Contingency",
  "Other",
] as const;
