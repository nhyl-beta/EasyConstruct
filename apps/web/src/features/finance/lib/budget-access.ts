/**
 * Who may call GET /api/finance/budgets (server: finance/access.ts FINANCE_PROJECT_READERS). Everyone else
 * gets 403, so screens that load budgets for every role (the new-workflow dialog on the dashboards) must
 * not ask: it produced a 403 and a console error on the Engineer, Architect and Consultant dashboards.
 * Roles are the server's (hyphenated) names.
 */
const BUDGET_READERS = ["finance-manager", "owner", "admin", "it-designer", "project-manager"];

export const canReadBudgets = (role: string | undefined | null): boolean => !!role && BUDGET_READERS.includes(role.replace(/_/g, "-"));
