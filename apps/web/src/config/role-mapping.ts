// NOTE: the legacy platform-admin role (since renamed "IT-Designer") has no
// separate entry here — it is stored as "it-designer" below. Any token still
// carrying its old identifier falls through toFrontendRole() unchanged and
// lands on the default role config.
export const BACKEND_TO_FRONTEND_ROLE: Record<string, string> = {
  admin: "admin",
  owner: "owner",
  "it-designer": "it_designer",
  "human-resources": "human_resources",
  "finance-manager": "finance_manager",
  "project-manager": "project_manager",
  architect: "architect",
  engineer: "engineer",
  "site-personnel": "site_personnel",
  consultant: "consultant",
};

export function toFrontendRole(role: string) {
  return BACKEND_TO_FRONTEND_ROLE[role] ?? role;
}
